# sdk
import os, io, json, sys, random
from pathlib import Path

# Firebase & GCP
import firebase_admin
from firebase_admin import credentials
from google.oauth2 import service_account
from firebase_admin import firestore

# ML
import tensorflow as tf

# Libraries
from PIL import Image
from lxml import etree
from google.cloud import storage
import contextlib2

# local wacko...

PATH_TO_OBJECT_DETECTION = '/Users/kiril/code/tensorflow/models/research/'
sys.path.insert(0, PATH_TO_OBJECT_DETECTION)
from object_detection.utils import dataset_util
from object_detection.dataset_tools import tf_record_creation_util


# read all XML files in:
#   /Users/kiril/code/inkstory/training/dataset/static/corpus/
# iterate, and for each XML:
#   - read into nested dict using util function
#   - if image missing:
#     > scale image (400x400)
#     > upload image
#     > create corpus records in FRB
#   - ensure image data in FRB has size {w: h:}
#   - scale coordinates (and sizes) in XML data
#   - store as annotation on image in FRB
#   - flatten XML to TFRecord format
# then output the whole thing to a collection of sharded files


INPUT_DIR = '/Users/kiril/code/inkstory/training/dataset/static/corpus/'
INTENDED_IMAGE_SIZE = (400, 400)

credentials_path = 'gs://tattoo-training/creds.json'
credentials_file = tf.io.gfile.GFile(credentials_path)
credentials_json = json.loads(credentials_file.read())
creds = credentials.Certificate(credentials_json)
firebase_admin.initialize_app(creds, {'projectId': 'inkstory'})

db = firestore.client();

storage_client = storage.Client()
image_bucket = storage_client.get_bucket('tattoo_images')
training_bucket = storage_client.get_bucket('tattoo-training')

def resize_image(path):
    with Image.open(str(path)) as image:
        if image.size == INTENDED_IMAGE_SIZE:
            return
        assert image.size[0] == image.size[1], "Can't rescale irregularly shaped image {} {}x{}".format(path, image.size[0], image.size[1])
        new = image.resize(INTENDED_IMAGE_SIZE, resample=Image.BICUBIC)
        new.save(str(path))


def read_xml_at(path):
    raw = path.read_text()
    xml = etree.fromstring(raw)
    return dataset_util.recursive_parse_xml_to_dict(xml)

def to_xml_content(val):
    return val if val is str else ('1' if val else '0') if val is bool else str(val)

def _to_xml(outer, val):
    if val is dict:
        for k, v in val.items():
            for val in (v if v is list else [v]):
                node = etree.SubElement(outer, k)
            if val is dict:
                for sub_k, sub_v in val.items():
                    _to_xml(node, sub_v)
                pass
            else:
                node.text = to_xml_content(v)

def to_xml(x):
    assert len(d) == 1
    for key, value in d.items():
        root = etree.Element(key)
        _to_xml(root, value)
        return root

def annotation_to_xml(annotation):
    if 'annotation' not in annotation:
        annotation = {'annnotation': annotation}
    else:
        assert len(annotation) == 1
    return to_xml(annotation)

def get_corpus_record(image_id):
    pass


class TattooLocation(dict):
    def __init__(self, d):
        self.update(d)

    @property
    def bounding_box(self):
        return self['bndbox']

    def scale_bounding_box(self, factor):
        bbox = self.bounding_box
        bbox['xmin'] = str(int(int(bbox['xmin']) * factor))
        bbox['ymin'] = str(int(int(bbox['ymin']) * factor))
        bbox['xmax'] = str(int(int(bbox['xmax']) * factor))
        bbox['ymax'] = str(int(int(bbox['ymax']) * factor))


class Annotation(dict):
    def __init__(self, d):
        self.update(d.get('annotation') or d)

    @property
    def image_path(self):
        return Path(self['path'])

    @property
    def local_path(self):
        return Path('{}/{}'.format(INPUT_DIR, self['filename']))

    @property
    def image_id(self):
        return self.image_path.stem

    @property
    def image_size(self):
        size = self['size']
        return (int(size['width']), int(size['height']))

    __doc = None
    @property
    def doc(self):
        if not self.__doc:
            self.__doc = db.collection('corpus').document(self.image_id)
        return self.__doc

    @property
    def tattoos(self):
        objects = self.get('object') or []
        return [TattooLocation(o) for o in objects if o['name'] == 'tattoo']

    def scale(self, factor):
        self['size']['width'] = str(int(int(self['size']['width']) * factor))
        self['size']['height'] = str(int(int(self['size']['height']) * factor))
        tattoos = self.tattoos
        for tattoo in tattoos:
            tattoo.scale_bounding_box(factor)
        self['object'] = tattoos

    def scale_to_intended_size(self):
        resize_image(self.image_path)
        size = self.image_size
        if size[0] > INTENDED_IMAGE_SIZE[0]:
            factor = float(INTENDED_IMAGE_SIZE[0]) / size[0]
            self.scale(factor)

    @property
    def is_local(self):
        return not self['path'].startswith('gs://')

    def sync_with_server(self):
        snap = self.doc.get()
        if not snap.exists:
            data = {'id': self.image_id,
                    'lastSeen': 0,
                    'status': 'unclassified'}
            self.doc.save(data)
        else:
            data = snap.to_dict()

        if not data.get('annotation'):
            self.upload_image()
            self.save_to_server()
        else:
            self.update(data)
            self['path'] = 'gs://{}/{}.jpg'.format(image_bucket.name, self.image_id)

    def upload_image(self):
        if self['path'].startswith('gs://'):
            return
        image_id = self.image_id
        blob = image_bucket.blob('{}.jpg'.format(image_id))
        if not blob.exists():
            print("uploading", self.image_path)
            with self.image_path.open(mode='rb') as local_file:
                blob.upload_from_file(local_file, content_type='image/jpeg')
        self['path'] = 'gs://{}/{}.jpg'.format(image_bucket.name, image_id)

    def save_to_server(self):
        self.doc.update({'annotation': self})

    def to_example(self):
        width = int(self['size']['width'])
        height = int(self['size']['height'])

        #with tf.gfile.
        with self.local_path.open(mode='rb') as f:
            encoded_jpg = f.read()

        xmins = []
        ymins = []
        xmaxs = []
        ymaxs = []

        classes_text = []
        classes_int = []
        poses = []
        difficult = []
        truncated = []
        for obj in (self['object'] or []):
            xmins.append(float(obj['bndbox']['xmin'])/width)
            xmaxs.append(float(obj['bndbox']['xmax'])/width)
            ymins.append(float(obj['bndbox']['ymin'])/height)
            ymaxs.append(float(obj['bndbox']['ymax'])/height)
            classes_text.append('tattoo'.encode('utf8'))
            classes_int.append(1)
            poses.append(obj['pose'].encode('utf8'))
            difficult.append(int(obj['difficult']))
            truncated.append(int(obj['truncated']))

        feature_dict = {
            'image/height': dataset_util.int64_feature(height),
            'image/width': dataset_util.int64_feature(width),
            'image/filename': dataset_util.bytes_feature(self['filename'].encode('utf8')),
            'image/source_id': dataset_util.bytes_feature(self['filename'].encode('utf8')),
            'image/key/sha256': dataset_util.bytes_feature(self.image_id.encode('utf8')),
            'image/encoded': dataset_util.bytes_feature(encoded_jpg),
            'image/format': dataset_util.bytes_feature('jpeg'.encode('utf8')),
            'image/object/bbox/xmin': dataset_util.float_list_feature(xmins),
            'image/object/bbox/xmax': dataset_util.float_list_feature(xmaxs),
            'image/object/bbox/ymin': dataset_util.float_list_feature(ymins),
            'image/object/bbox/ymax': dataset_util.float_list_feature(ymaxs),
            'image/object/class/text': dataset_util.bytes_list_feature(classes_text),
            'image/object/class/label': dataset_util.int64_list_feature(classes_int),
            'image/object/difficult': dataset_util.int64_list_feature(difficult),
            'image/object/truncated': dataset_util.int64_list_feature(truncated),
            'image/object/view': dataset_util.bytes_list_feature(poses),
        }

        return tf.train.Example(features=tf.train.Features(feature=feature_dict))


if __name__ == '__main__':
    examples = []
    for xml_path in Path(INPUT_DIR).glob('*.xml'):
        annotation = Annotation(read_xml_at(xml_path))
        if annotation.image_size[0] > INTENDED_IMAGE_SIZE[0]:
            annotation.scale_to_intended_size()
        annotation.sync_with_server()
        examples.append(annotation.to_example())

    num_shards = 5
    num_examples = len(examples)
    num_train = int(0.7 * num_examples)
    random.seed(42)
    random.shuffle(examples)
    training_examples = examples[:num_train]
    validate_examples = examples[num_train:]
    batches = [{'suffix': 'train',
                'examples': training_examples},
               {'suffix': 'validate',
                'examples': validate_examples}]
    for batch in batches:
        suffix = batch['suffix']
        examples = batch['examples']
        filename = 'tattoos-{}.record'.format(suffix)
        output_file_path = '{}/{}'.format(INPUT_DIR, filename)

        with contextlib2.ExitStack() as tf_record_close_stack:
            output_tf_records = tf_record_creation_util.open_sharded_output_tfrecords(tf_record_close_stack,
                                                                                      output_file_path,
                                                                                      num_shards)
            for idx, example in enumerate(examples):
                shard = output_tf_records[idx % num_shards]
                shard.write(example.SerializeToString())
