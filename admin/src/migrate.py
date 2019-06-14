import firebase_admin as fadmin
from firebase_admin import credentials, firestore
from pymongo import MongoClient
from argparse import ArgumentParser, ArgumentTypeError


arg_parser = ArgumentParser()
args = arg_parser.parse_args()


creds = credentials.Certificate('/Users/kiril/.firebase-inkstory-5bbf3a8df360.json')

fadmin.initialize_app(creds, {'projectId': 'inkstory'})

fs = firestore.client()

mongo = MongoClient()
tattoos_db = mongo.tattoos
batch = tattoos_db.training_batch
corpus = tattoos_db.corpus
style = tattoos_db.style
motif = tattoos_db.motif
prediction = tattoos_db.prediction

# now we write 'em to fs...

fs_corpus = fs.collection('corpus')
fs_style = fs.collection('style')
fs_motif = fs.collection('motif')
fs_batch = fs.collection('batch')
fs_prediction = fs.collection('prediction')

# for image in corpus.find():
#     fs_corpus.document(image['_id']).set(image)

# for s in style.find():
#     fs_style.document(s['_id']).set(s)

# for m in motif.find():
#     if not m['_id']:
#         continue
#     fs_motif.document(m['_id']).set(m)

# for b in batch.find():
#     b['_id'] = str(b['_id'])
#     fs_batch.document(b['_id']).set(b)

for p in prediction.find():
    p['_id'] = str(p['_id'])
    fs_prediction.document(p['_id']).set(p)
    fs_batch.document(p['_id']).delete()
