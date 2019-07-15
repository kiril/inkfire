import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as express from 'express';
import * as handlebars from 'express-handlebars';
import * as moment from 'moment';
import * as cors from 'cors';


const FieldValue = admin.firestore.FieldValue;

// admin.initializeApp({
//   credential: admin.credential.applicationDefault(),
//   databaseURL: 'https://inkstory.firebaseio.com'
// });

let serviceAccount = require('/Users/kiril/.firebase-inkstory-5bbf3a8df360.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//admin.initializeApp(functions.config().firebase);

const db = admin.firestore();
const app = express();

const helpers = {
    ifstyle: (image: any, s: string, options:any) => {
        return image.style[s] ? options.fn() : "";
    },
    ifmotif: (image: any, m: string, options:any) => {
        return image.motif[m] ? options.fn() : "";
    }
};

const hbs = handlebars({helpers: helpers});


app.engine('handlebars', hbs);
app.set('view engine', 'handlebars');
app.use(express.json())
app.use(cors({origin: true}));


app.get('/', (request, response) => {
    return response.send("Main");
});

app.get('/train', (request, response) => {
    return db.collection('batch')
        .where('status', '==', 'active')
        .get()
        .then(snapshot => {
            const batches: Array<any> = [];
            snapshot.forEach(doc => {
                batches.push(doc.data());
            });
            response.render('train', {'batches': batches});
        });
});

app.get('/batch/:batchId', (request, response) => {
    const batchId = request.params.batchId;
    return db.collection('batch').doc(batchId).get()
        .then(doc => {
            if ( !doc.exists ) {
                response.end(404);
                return;
            }

            const data = doc.data();
            if ( !data ) {
                response.end(500);
                return;
            }

            if ( request.method === 'GET' ) {
                if ( data.sessions ) {
                    data.sessions.forEach(session => {
                        if ( session.datetime ) {
                            session.when = moment(session.datetime.toDate()).format("dddd MM/DD/YY, HH:mm");
                        }
                    });
                }
                const context = {batch: data,
                                 sample_count: data.sample_ids ? data.sample_ids.length : 0,
                                 pool_count: data.pool_ids ? data.pool_ids.length : 0}
                response.render('batch', context);
                return;

            }
        });
});

app.get('/batch/:batchId/:sessionId', (request, response) => {
    const batchId = request.params.batchId;
    const sessionId = request.params.sessionId;

    const context: {[key: string]: any} = {}

    return db.collection('batch').doc(batchId).get()
        .then(doc => {
            if ( !doc.exists ) { throw 404; }

            const batch = doc.data()
            if ( !batch ) { throw 500; }

            context['batch'] = batch
            batch.sessions.forEach((session:any) => {
                if ( session.id === sessionId ) {
                    context['session'] = session;
                    if ( session.datetime ) {
                        console.log("datetime=", session.datetime);
                        session.when = moment(session.datetime.toDate()).format("dddd MM/DD/YY, HH:mm");
                    }

                }
            });

            if ( ! context['session'] ) {
                console.log("couldn't find session", batchId, sessionId);
                throw 500;
            }

            return db.collection('prediction').where('session', '==', sessionId).get()
                    .then(snapshot => {
                        const predictions: Array<any> = [];
                        snapshot.forEach(predictionDoc => {
                            const prediction = predictionDoc.data();
                            prediction.scores.forEach(score => {
                                if ( score.score > 0.4 ) {
                                    score.strong = true;
                                }
                            });
                            predictions.push(prediction);
                        });
                        context.predictions = predictions;
                        response.render('session', context);
                    });
        })
        .catch(error => {
            console.log(error);
            if ( error === 404 ) {
                response.end(404);
                return;
            }
            response.end(500);
            return;
        });
});

app.get('/browse', (request, response) => {
    const context: {[key: string]: any} = {}
    return db.collection('style').where('status', '==', 'active').get()
        .then(snapshot => {
            const styles: Array<any> = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                data.name = doc.id;
                data.count = data.count || 0;
                styles.push(data);
            });

            context.styles = styles;

            return db.collection('motif').where('status', '==', 'active').get()
        })
        .then(snapshot => {
            const motifs: Array<any> = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                data.name = doc.id;
                data.count = data.count || 0;
                motifs.push(data);
            });
            context.motifs = motifs;

            response.render('browse', context);
        })
        .catch(error => {
            console.log(error);
            response.send(error === 404 ? 404 : 500);
        });
});

const JSON_OK = '{"result": "ok"}';

app.post('/image/:imageId/classify', (request, response) => {
    const imageId = request.params.imageId;
    const json = request.body;
    console.log(json);
    const attribute = json.category;
    if ( attribute !== 'style' && attribute !== 'motif' ) {
        response.end(500);
        return;
    }
    const value = json.id;
    const add = json.tag || false;

    return db.collection('corpus').doc(imageId)
        .update({[attribute+"s"]: add ? FieldValue.arrayUnion(value) : FieldValue.arrayRemove(value)})
        .then(() => {
            return db.collection(attribute).doc(value).get()
                .then(doc => {
                    if ( !doc.exists ) {
                        return db.collection(attribute).doc(value)
                            .set({name: value, status: 'active', count: 0});
                    }
                })
        })
        .then(() => {
            return db.collection(attribute).doc(value)
                .update({count: FieldValue.increment(add ? 1 : 0)})
        })
        .then(() => {
            response.send(JSON_OK);
        });
});

app.delete('/image/:imageId', (request, response) => {
    const imageId = request.params.imageId;
    return db.collection('corpus').doc(imageId).update({status: 'deleted'})
        .then(() => {
            response.send(JSON_OK);
        })
        .catch(e => {
            console.log(e);
            response.end(500);
        });
});

app.post('/image/:imageId', (request, response) => {
    const imageId = request.params.imageId;
    const json = request.body;
    const updates: {[key: string]: any} = {}

    if ( json.action === 'restore' ) {
        updates.status = 'unclassified';
    } else if ( json.action === 'complete' ) {
        updates.status = 'classified';
    } else if ( json.action === 'mark' ) {
        updates.instructive = (json.instructive == "true");
    }

    return db.collection('corpus').doc(imageId).update(updates)
        .then(() => {
            response.send(JSON_OK);
        })
        .catch(e => {
            console.log(e);
            response.end(500);
        });
});

app.get('/classify', (request, response) => {
    let query = (q:admin.firestore.Query) => {
        return q.where('status', '==', 'unclassified');
    }

    if ( request.query.motif ) {
        query = (q) => {
            return q.where('motifs', 'array-contains', request.query.motif)
                .where('status', '==', 'classified');
        }

    } else if ( request.query.style ) {
        query = (q) => {
            return q.where('styles', 'array-contains', request.query.style)
                .where('status', '==', 'classified');
        }
    }

    return query(db.collection('corpus').limit(1)).get()
        .then(snapshot => {
            const id: string = snapshot.docs[0].id;
            let url = '/image/'+id;
            if ( request.query.motif ) {
                url += '?motif='+request.query.motif;
            } else if ( request.query.style ) {
                url += '?style='+request.query.style;
            }
            response.redirect(url);
        });
});

app.get("/image/:imageId", (request, response) => {
    const context: {[key: string]: any} = {};
    context.id = request.params.imageId;
    if ( request.query.motif ) {
        context.motif = request.query.motif;
    } else if ( request.query.style ) {
        context.style = request.query.style;
    }

    return db.collection('corpus')
        .doc(request.params.imageId)
        .get()
        .then(doc => {
            const image = doc.data() || {};
            image['style'] = {};
            image['motif'] = {};

            (image.styles || []).forEach((s:string) => {
                image.style[s] = true;
            });
            (image.motifs || []).forEach((m:string) => {
                image.motif[m] = true;
            });
            context.image = image;
            return db.collection('style').where('status', '==', 'active').get()

        }).then(snapshot => {
            const styles: Array<string> = [];
            snapshot.forEach(doc => {
                styles.push(doc.id)
            })
            context.styles = styles;
            return db.collection('motif').where('status', '==', 'active').get()

        }).then(snapshot => {
            const motifs: Array<string> = [];
            snapshot.forEach(doc => {
                if ( !doc.data().deleted ) {
                    motifs.push(doc.id);
                }
            })
            context.motifs = motifs;
            response.render('image', context);
        });
});

exports.expressApp = functions.https.onRequest(app);
