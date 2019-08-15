# sdk
import os, io, json, sys
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

# local wacko...

PATH_TO_OBJECT_DETECTION = '/Users/kiril/code/tensorflow/models/research/'
sys.path.insert(0, PATH_TO_OBJECT_DETECTION)
from object_detection.utils import dataset_util


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
            print("scaling from {} to {} by {}".format(size, INTENDED_IMAGE_SIZE, factor))
            self.scale(factor)

    @property
    def is_local(self):
        return not self['path'].startswith('gs://')

    def sync_with_server(self):
        snap = self.doc.get()
        if not snap.exists:
            self.upload_image()
            data = {'id': self.image_id,
                    'lastSeen': 0,
                    'status': 'unclassified'}
            self.doc.save(data)
        else:
            data = snap.to_dict()

        if not data.get('annotation') or True:
            self.upload_image()
            self.save_to_server()
        else:
            self['path'] = 'gs://{}/{}.jpg'.format(image_bucket.name, self.image_id)

    def upload_image(self):
        if self['path'].startswith('gs://'):
            return
        image_id = self.image_id
        blob = image_bucket.blob('{}.jpg'.format(image_id))
        with self.image_path.open(mode='rb') as local_file:
            blob.upload_from_file(local_file, content_type='image/jpeg')
        self['path'] = 'gs://{}/{}.jpg'.format(image_bucket.name, image_id)

    def save_to_server(self):
        self.doc.update({'annotation': self})


if __name__ == '__main__':
    for xml_path in Path(INPUT_DIR).glob('*.xml'):
        annotation = Annotation(read_xml_at(xml_path))
        print(json.dumps(annotation, indent=2))
        if annotation.image_size[0] > INTENDED_IMAGE_SIZE[0]:
            annotation.scale_to_intended_size()
            print(json.dumps(annotation, indent=2))
        annotation.sync_with_server()
        print("---")
        print(json.dumps(annotation, indent=2))
        break
