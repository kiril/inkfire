import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as express from 'express';
import * as handlebars from 'express-handlebars';
import * as moment from 'moment';
import * as cors from 'cors';
import * as bodyParser from 'body-parser';

const eachThen = (list, callback) => {
    const promises: Array<Promise<any>> = [];
    list.forEach(item => {
        promises.push(callback(item));
    });
    return Promise.all(promises);
};


const FieldValue = admin.firestore.FieldValue;

// admin.initializeApp({
//   credential: admin.credential.applicationDefault(),
//   databaseURL: 'https://inkstory.firebaseio.com'
// });


//const serviceAccount = require('/Users/kiril/.firebase-inkstory-5bbf3a8df360.json');

//admin.initializeApp({
//  credential: admin.credential.cert(serviceAccount)
//});

admin.initializeApp(functions.config().firebase);

const db = admin.firestore();
const app = express();

const pad = (num, digits) => {
    let ret = num + '';
    while ( ret.length < digits ) {
        ret = '0' + ret;
    }
    return ret;
}

const helpers = {
    ifstyle: (image: any, s: string, options:any) => {
        return image.style[s] ? options.fn() : "";
    },
    ifmotif: (image: any, m: string, options:any) => {
        return image.motif[m] ? options.fn() : "";
    },
    ifpredicted: (image: any, style: string, options: any) => {
        const prediction = (image.predictions || {})[style];
        if ( !prediction ) {
            return "";
        }
        return prediction >= 0.7 ? options.fn() : "";
    },
    ifcontemplated: (image: any, style: string, options: any) => {
        const prediction = (image.predictions || {})[style];
        if ( !prediction ) {
            return "";
        }
        return prediction >= 0.33 ? options.fn() : "";
    },
    ifequal: (a: any, b: any, options:any) => {
        return a === b ? options.fn() : "";
    },
    pct: (a: any, places: any, option: any) => {
        if ( places ) {
            const pct = a * 100;
            if ( !places ) {
                return Math.round(pct) + "%";
            }
            const base = Math.floor(pct);
            const remainder = pct - base;
            const multiplier = Math.pow(10, places);
            let dec = Math.round(remainder * multiplier);
            if ( dec === multiplier ) {
                dec -= 1;
            }
            return base + "." + dec + "%";
        }
        return Math.round(a*100) + '%'
    },
    comma: (a: any, option: any) => {
        if ( a < 1000 ) {
            return a;
        }
        const thousands = Math.floor(a/1000);
        const ones = a - (thousands * 1000);
        if ( thousands < 1000 ) {
            return thousands + "," + pad(ones, 3);
        }
        const millions = Math.floor(thousands/1000);
        if ( millions < 1000 ) {
            return millions + "," + pad(thousands, 3) + "," + pad(ones, 3);
        }
        const billions = Math.floor(millions/1000);
        return billions + "," + pad(millions, 3) + "," + pad(thousands, 3) + "," + pad(ones, 3);
    }
};

const hbs = handlebars({helpers: helpers});


app.engine('handlebars', hbs);
app.set('view engine', 'handlebars');
app.use(express.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(cors({origin: true}));

interface BoolDict { [key: string]: boolean; }
interface NumberDict { [key: string]: number; }

interface Context {
    [key: string]: any;
}

interface Image {
    id: string;
    status: string;
    style?: BoolDict;
    tags?: BoolDict;
    styles?: string[];
}

interface Score {
    tag: string;
    score: number;

    unlikely?: boolean;
    possible?: boolean;
    probable?: boolean;
    positive?: boolean;
    correct?: boolean;
    incorrect?: boolean;
    contrarian?: boolean;

    weightClass?: string;
    color?: string;
}

interface Prediction {
    scores: Score[];
    index?: number;

    [key: string]: any;
}

interface Results {
    backtest?: Prediction[];
    predictions?: Prediction[];
}

interface Batch {
    when?: string;
    stamp?: string;

    predictions?: Prediction[];
    results?: Results;
    stats?: NumberDict;

    training_image_ids?: string[]
    pool_image_ids?: string[]
    test_image_ids?: string[]

    [key: string]: any;
}

const annotateImage = (image: Image) => {
    image.style = {};
    image.tags = {};
    image[image.status] = true;

    const tags = image.styles || [];

    tags.forEach((t:string) => {
        image.style[t] = true;
        image.tags[t] = true;
    });
};

const annotateBatch = (batch: Batch) => {
    if ( batch.start ) {
        batch.when = batch.when || moment(batch.start.toDate()).format("ddd MM/DD, h:mma");
        batch.stamp = batch.stamp || moment(batch.start.toDate()).format("YY/MM/DD.HH:mm");
    }

    if ( batch.results && batch.results.backtest ) {
        const meaningfulTags: Prediction[] = [];
        batch.results.backtest.forEach(function(tag) {
            if ( tag.results.correct + tag.results.incorrect >= 5 ) {
                meaningfulTags.push(tag);
            }
        });
        batch.results.backtest = meaningfulTags;
        batch.results.backtest.sort(function(a, b) {
            return a.tag < b.tag ? -1 : b.tag < a.tag ? 1 : 0;
        });
    }

    batch[batch.status] = true;

    batch.stats = {training: (batch.training_image_ids || []).length,
                   test: (batch.test_image_ids || []).length,
                   pool: (batch.pool_image_ids || []).length};

    if ( batch.predictions ) {
        let pNum = 0;
        batch.predictions.forEach(p => {
            p.index = pNum++;
            const foundStyles: Array<string> = [];
            p.scores.sort((a, b) => {
                return b.score - a.score;
            });

            const imageTags = p.tags || [];
            const isClassified  = imageTags.length > 0 ? true : false;
            const isImageTagged = function(t) { return imageTags.indexOf(t) != -1; }

            const meaningfulScores = [];
            const threshold = imageTags.length > 0 ? 0.4 : 0.2;
            p.scores.forEach(s => {
                if ( s.score < threshold && !isImageTagged(s.tag) ) {
                    return;
                }
                meaningfulScores.push(s);
            });
            p.scores = meaningfulScores;

            p.scores.forEach(s => {
                foundStyles.push(s.tag);
                s.score = Math.round(s.score*100);
                s.unlikely = s.score < 25;
                s.possible = s.score >= 25 && s.score < 50;
                s.probable = s.score >= 50 && s.score < 75;
                s.positive = s.score >= 75;

                if ( imageTags.indexOf(s.tag) != -1 ) {
                    s.correct = true;
                } else if ( isClassified ) {
                    s.incorrect = true;
                }

                if ( s.incorrect && (s.positive || s.probable) ) {
                    s.contrarian = true;
                }

                s.weightClass = s.score >= 75 ? "font-weight-bold" : s.score >= 50 ? "font-weight-medium" : "font-weight-normal";
                s.color = s.correct && s.score < 50 ? "text-bizarre" : s.incorrect && s.score >= 50 ? "text-interesting" : s.incorrect ? "text-muted" : "text-dark";
            });


            imageTags.forEach(s => {
                if ( foundStyles.indexOf(s) == -1 ) {
                    p.scores.push({tag: s, score: 0, correct: true, unlikely: true, weightClass: 'font-weight-normal', color: 'text-orange'});
                }
            });
        });
    }
};

function shuffle(a) {
    let j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

app.get('/', (request, response) => {
    return response.send("Main");
});

app.get('/train', (request, response) => {
    const batches: Array<any> = [];
    console.log("/train starting at " + new Date());

    return db.collection('batch')
        .orderBy('start', 'desc')
        .limit(48)
        .get()
        .then(snapshot => {
            console.log("/train query returned at " + new Date());
            snapshot.forEach(doc => {
                const batch = doc.data();
                batch.id = doc.id;
                if ( batch.start ) {
                    annotateBatch(batch);
                    batches.push(batch);
                }
            });
        })
        .then(() => {
            console.log("/train started sort at " + new Date());
            batches.sort((a, b) => {
                if ( a.stamp && !b.stamp ) {
                    return -1;
                } else if ( b.stamp && !a.stamp ) {
                    return 1;
                }
                return a.stamp > b.stamp ? -1 : b.stamp > a.stamp ? 1 : 0;
            });

            console.log("/train returned at " + new Date());
            response.render('train', {batches: batches, title: 'Training Batches'});
        })
        .catch(e => {
            console.log("error in /train");
            console.log(e);
            response.end(500);
        });
});

app.get('/batch/:batchId', (request, response) => {
    const batchId = request.params.batchId;
    const context: Context = {};
    return db.collection('batch').doc(batchId).get()
        .then(doc => {
            if ( !doc.exists ) {
                response.end(404);
                return;
            }

            const batch = doc.data();
            if ( !batch ) {
                response.end(500);
                return;
            }

            batch.id = doc.id;
            annotateBatch(batch);
            context.batch = batch;
            context.title = batch.when;
            return db.collection('style').where('status', '==', 'active').get()
        }).then(snapshot => {
            const styles = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const id = doc.id;
                styles.push(data.name || id);
            });
            context.styles = styles;
            response.render('batch', context);
        });
});

app.get('/browse', (request, response) => {
    const context: {[key: string]: any} = {title: 'Browse Tags'}

    return db.collection('style')
        .where('status', '==', 'active')
        .get()
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
            response.end(error === 404 ? 404 : 500);
        });
});

const associations = {
    'leafy': ['floral'],
    'sketch': ['crosshatch', 'ink', 'pointilism'],
    'illustrative': [],
    'ornamental': ['jewelry'],
    'jewelry': ['ornamental', 'vivid'],
    'clocks': ['smoky', 'realistic', 'graywork', 'floral'],
    'american': ['darkwork', 'heavy', 'floral', 'leafy'],
    'neo-american': ['floral', 'fine', 'leafy', 'linework'],
    'angled': ['geometric'],
    'geometric': ['angled'],
    'blackwork': ['darkwork', 'graywork'],
    'graywork': ['landscape'],
    'cartoon': ['illustrative'],
    'anime': ['illustrative', 'japanese'],
    'irezumi': ['japanese', 'illustrative'],
    'splash of color': ['color'],
    'op-art': ['glitch'],
    'abstract': ['glitch', 'linework'],
    'colorized': ['color'],
    'mandala': ['linework', 'heavy', 'indian', 'fine'],
    'sepia': ['color'],
    'neon': ['color'],
    'pastel': ['color'],
    'watercolor': ['color'],
    'red and black': ['color'],
    'redwork': ['color', 'linework', 'illustrative'],
    'bluework': ['color', 'linework', 'illustrative'],
    'floral': ['leafy'],
    'tinted': ['color',  'pastel'],
    'fine': ['linework'],
    'linework': ['fine', 'heavy', 'illustrative'],
    'henna': ['indian'],
    'color': ['pastel', 'neon', 'sepia', 'vivid', 'primary', 'landscape']
};

const dissociations = {
    'sepia': ['neon', 'pastel', 'primary', 'vivid'],
    'pastel': ['neon', 'primary', 'sepia'],
    'primary': ['sepia', 'neon', 'pastel'],
    'illustrative': ['linework'],
    'graywork': ['color', 'illustrative'],
    'fine': ['heavy'],
    'heavy': ['fine'],
    'person': ['landscape'],
    'blackwork': ['graywork'],
    'halo': ['landscape']
};

app.get('/style/:style/review', (request, response) => {
    const context: {[key: string]: any} = {};
    context.style = request.params.style;

    return db.collection('style').where('status', '==', 'active').get()
        .then(snapshot => {
            const styles: Array<string> = [];
            snapshot.forEach(doc => {
                styles.push(doc.id);
            });
            context.styles = styles;
        })
        .then(() => {
            return db.collection('corpus')
                .where('status', '==', 'classified')
                .where('styles', 'array-contains', request.params.style)
                .get()
                .then(snapshot => {
                    const images: Array<any> = [];
                    snapshot.forEach(doc => {
                        const id = doc.id;
                        const image = doc.data();
                        image.id = id;
                        image.missingStyles = [];
                        const styles = image.styles || [];

                        Object.keys(associations).forEach(style => {
                            if ( styles.indexOf(style) > -1 ) {
                                associations[style].forEach(other => {
                                    if ( styles.indexOf(other) == -1 && image.missingStyles.indexOf(other) == -1 ) {
                                        image.missingStyles.push(other);
                                    }
                                });
                            }
                        });

                        Object.keys(dissociations).forEach(style => {
                            if ( styles.indexOf(style) == -1 ) {
                                return;
                            }
                            dissociations[style].forEach(other => {
                                const index = image.missingStyles.indexOf(other);
                                if ( index > -1 ) {
                                    image.missingStyles.splice(index, 1);
                                }
                            });
                        });
                        images.push(image);
                    });
                    let idx = 0;
                    images.forEach(image => {
                        image.index = idx;
                        idx += 1;
                    });
                    context.images = images;
                    response.render('review', context);
                });
        });
});

const JSON_OK = '{"result": "ok"}';

app.put('/image/:imageId/tag/:tag', (request, response) => {
    const imageId = request.params.imageId;
    const tag = request.params.tag;
    const json = request.body;

    return db.collection('corpus').doc(imageId)
        .update({styles: FieldValue.arrayUnion(tag), status: 'classified'})
        .then(() => {
            return db.collection('style').doc(tag).get()
                .then(doc => {
                    if ( !doc.exists ) {
                        return db.collection('style').doc(tag)
                            .set({id: tag,
                                  name: tag,
                                  status: 'active',
                                  count: 1});
                    } else {
                        return db.collection('style').doc(tag)
                            .update({count: FieldValue.increment(1)})
                    }
                })
        })
        .then(() => {
            response.send(JSON_OK);
        })
        .catch(error => {
            console.log("tag failed: " + tag + " on " + imageId);
            console.log(error);
            response.end(500);
        });
});

app.delete('/image/:imageId/tag/:tag', (request, response) => {
    const imageId = request.params.imageId;
    const tag = request.params.tag;

    return db.collection('corpus').doc(imageId)
        .update({styles: FieldValue.arrayRemove(tag)})
        .then(() => {
            return db.collection('style').doc(tag).get()
                .then(doc => {
                    if ( doc.exists ) {
                        return db.collection('style').doc(tag).update({count: FieldValue.increment(-1)});
                    }
                })
        })
        .then(() => {
            response.send(JSON_OK);
        })
        .catch(error => {
            console.log("tag failed: " + tag + " on " + imageId);
            console.log(error);
            response.end(500);
        });
});

app.post('/image/:imageId/classify/style', (request, response) => {
    const imageId = request.params.imageId;
    const json = request.body;
    const add = json.add ? true : false;
    const styles = json[add ? 'add' : 'remove'];

    return db.collection('corpus').doc(imageId)
        .update({styles: add ? FieldValue.arrayUnion(...styles) : FieldValue.arrayRemove(...styles)})
        .then(() => {
            return eachThen(styles, style => {
                return db.collection('style').doc(style).get()
                    .then(doc => {
                        if ( !doc.exists ) {
                            return db.collection('style').doc(style)
                                .set({id: style,
                                      name: style,
                                      status: 'active',
                                      count: 0});
                        }
                    })
            });
        })
        .then(() => {
            return eachThen(styles, style => {
                return db.collection('style').doc(style)
                    .update({count: FieldValue.increment(add ? 1 : -1)})
            });
        })
        .then(() => {
            response.send(JSON_OK);
        })
        .catch(error => {
            console.log("style classify "+(add ? 'add' : 'remove')+" failed: " + styles);
            console.log(error);
            response.end(500);
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

app.delete('/batch/:batchId/predictions/:imageId', (request, response) => {
    const batchId = request.params.batchId;
    const imageId = request.params.imageId;
    return db.collection('batch').doc(batchId).get()
        .then(doc => {
            const batch = doc.data();
            const predictions = batch.predictions || [];
            predictions.forEach(p => {
                if ( p.image_id == imageId ) {
                    p.deleted = true;
                }
            });
            return db.collection('batch').doc(batchId).set(batch);
        })
        .then(() => {
            response.send(JSON.stringify({result: 'OK',
                                          deleted: imageId}));
        });
});

app.put('/batch/:batchId/predictions/:imageId/tags/:tag', (request, response) => {
    const batchId = request.params.batchId;
    const imageId = request.params.imageId;
    const tag = request.params.tag;
    let returnTags = [];

    return db.collection('batch').doc(batchId).get()
        .then(doc => {
            const batch = doc.data();
            const predictions = batch.predictions || [];
            predictions.forEach(p => {
                if ( p.image_id == imageId ) {
                    let tags = p.tags || [];
                    if ( !tags ) {
                        tags = [tag];
                    } else if ( tags.indexOf(tag) == -1 ) {
                        tags.push(tag);
                    }
                    p.tags = tags;
                    returnTags = tags;
                }
            });
            return db.collection('batch').doc(batchId).update({predictions: predictions});
        })
        .then(() => {
            return db.collection('corpus').doc(imageId)
                .update({styles: FieldValue.arrayUnion(tag)});
        })
        .then(() => {
            const styleRef = db.collection('style').doc(tag)
            return styleRef.get()
                .then(doc => {
                    if ( !doc.exists ) {
                        return styleRef.set({id: tag, name: tag, status: 'active', count: 1})
                    } else {
                        return styleRef.update({count: FieldValue.increment(1)});
                    }
                });
        })
        .then(() => {
            response.json({imageId: imageId, tags: returnTags});
        });
});

app.delete('/batch/:batchId/predictions/:imageId/tags/:tag', (request, response) => {
    const batchId = request.params.batchId;
    const imageId = request.params.imageId;
    const tag = request.params.tag;
    let returnTags = [];
    return db.collection('batch').doc(batchId).get()
        .then(doc => {
            const batch = doc.data();
            const predictions = batch.predictions || [];
            let found = false;
            predictions.forEach(p => {
                if ( p.image_id == imageId ) {
                    const tags = p.tags || [];
                    if ( tags && tags.indexOf(tag) > -1 ) {
                        tags.splice(tags.indexOf(tag), 1);
                        found = true;
                    }
                    p.tags = tags;
                    returnTags = tags;
                }
            });
            if ( found ) {
                return db.collection('batch').doc(batchId).update({predictions: predictions});
            }
        })
        .then(() => {
            return db.collection('corpus').doc(imageId).update({styles: FieldValue.arrayRemove(tag)});
        })
        .then(() => {
            response.json({imageId: imageId, tags: returnTags});
        });
});

app.get('/style/:style', (request, response) => {
    const context: {[key: string]: any} = {};
    const styleId = request.params.style;
    let count = 0;
    context.name = styleId;
    return db.collection('style').doc(styleId).get()
        .then(doc => {
            context.style = doc.data();
            context[context.style.status] = true;
            return db.collection('corpus')
                .where('styles', 'array-contains', styleId)
                .where('status', '==', 'classified')
                .get()
                .then(snapshot => {
                    context.images = [];
                    return eachThen(snapshot, image_doc => {
                        count += 1;
                        if ( context.images.length < 3 ) {
                            const image = image_doc.data();
                            image.id = image_doc.id;
                            context.images.push(image);
                        }
                    })
                })
        })
        .then(() => {
            context.style.count = count;
            return db.collection('style').doc(styleId).update({count: count})
        })
        .then(() => {
            response.render('style', context);
        })
        .catch(e => {
            console.log(e);
            response.send(500);
        });
});


app.delete('/style/:style', (request, response) => {
    const style = request.params.style;
    return db.collection('corpus')
        .where('styles', 'array-contains', style)
        .get()
        .then(snapshot => {
            return eachThen(snapshot, doc => {
                return db.collection('corpus').doc(doc.id).update({styles: FieldValue.arrayRemove(style),
                                                                   oldStyles: FieldValue.arrayUnion(style)});
            });
        })
        .then(() => {
            return db.collection('style').doc(style)
                .update({status: 'deleted'})
                .then(() => {
                    response.send(JSON_OK);
                });
        });
});


app.post('/style/:style', (request, response) => {
    const style = request.params.style;
    if ( request.body.name ) {
        const newStyle = request.body.name;
        let count = 0;
        const newRef = db.collection('style').doc(newStyle)
        return newRef.set({status: 'active', count: 0, name: newStyle})
            .then(() => {
                return db.collection('corpus')
                    .where('styles', 'array-contains', style)
                    .get()
                    .then(snapshot => {
                        return eachThen(snapshot, doc => {
                            count += 1;
                            const imageRef = db.collection('corpus').doc(doc.id)
                            return imageRef.update({styles: FieldValue.arrayRemove(style),
                                                    oldStyles: FieldValue.arrayUnion(style)})
                                .then(() => {
                                    return imageRef.update({styles: FieldValue.arrayUnion(newStyle)})
                                });
                        });
                    })
                    .then(() => {
                        return newRef.update({count: count})
                            .then(() => {
                                return db.collection('style').doc(style).update({status: 'deleted'});
                            })
                            .then(() => {
                                response.send(JSON_OK);
                            });
                    });
            });

    } else if ( request.body.add ) {
        const addTag = request.body.add;
        let count = 0;
        return db.collection('corpus')
            .where('styles', 'array-contains', style)
            .get()
            .then(snapshot => {
                return eachThen(snapshot, doc => {
                    const image = doc.data();
                    const styles = image.styles || [];
                    if ( styles.indexOf(addTag) == -1 ) {
                        count += 1;
                        const imageRef = db.collection('corpus').doc(doc.id)
                        return imageRef.update({styles: FieldValue.arrayUnion(addTag)});

                    } else {
                        return Promise.resolve(null);
                    }
                });
            })
            .then(() => {
                return db.collection('style').doc(style).update({count: FieldValue.increment(count)})
                    .then(() => {
                        response.send(JSON_OK);
                    });
            });
    }
});


app.get('/classify', (request, response) => {
    let query = (q:admin.firestore.Query) => {
        return q.where('status', '==', 'unclassified').orderBy('lastSeen');
    }

    if ( request.query.motif ) {
        query = (q) => {
            return q.where('motifs', 'array-contains', request.query.motif)
                .where('status', '==', 'classified')
                .orderBy('lastSeen');
        }

    } else if ( request.query.style ) {
        query = (q) => {
            return q.where('styles', 'array-contains', request.query.style)
                .where('status', '==', 'classified')
                .orderBy('lastSeen');
        }

    } else if ( request.query.status ) {
        query = (q) => {
            return q.where('status', '==', request.query.status)
                .orderBy('lastSeen')
        }
    }

    return query(db.collection('corpus')).limit(1).get()
        .then(snapshot => {
            const id: string = snapshot.docs[0].id;
            let url = '/image/'+id;
            if ( request.query.motif ) {
                url += '?motif='+request.query.motif;
            } else if ( request.query.style ) {
                url += '?style='+request.query.style;
            } else if ( request.query.status ) {
                url += '?status=' + request.query.status;
            }
            return db.collection('corpus').doc(id)
                .update({lastSeen: new Date().getTime()})
                .then(() => {
                    response.redirect(url);
                });
        })
        .catch(e => {
            console.log("failed later")
            console.log(e);
            response.end(500);
        });
});

app.get('/js/image/:imageId', (request, response) => {
    return db.collection('corpus').doc(request.params.imageId).get()
        .then(doc => {
            const image: Image = doc.data() as Image;
            image.id = doc.id;
            annotateImage(image);
            response.json({image: image});
        });
});

app.get('/image/:imageId', (request, response) => {
    const context: {[key: string]: any} = {title: 'Classify Image'};
    context.id = request.params.imageId;
    if ( request.query.motif ) {
        context.motif = request.query.motif;
    } else if ( request.query.style ) {
        context.style = request.query.style;
    } else if ( request.query.batch ) {
        context.batch = request.query.batch;
    } else if ( request.query.status ) {
        context.status = request.query.status;
    }

    return db.collection('corpus')
        .doc(request.params.imageId)
        .get()
        .then(doc => {
            const image: Image = doc.data() as Image || {} as Image;
            image['_id'] = doc.id;
            image.id = doc.id;
            annotateImage(image);
            context.image = image;
            return db.collection('style').where('status', '==', 'active').get()

        }).then(snapshot => {
            const styles: Array<any> = [];
            snapshot.forEach(doc => {
                const style = doc.data()
                style.id = doc.id;
                styles.push(style)
            })
            context.styles = styles;

            if ( context.batch ) {
                return db.collection('batch').doc(context.batch).get()
                    .then(doc => {
                        const batch = doc.data();
                        (batch.predictions || []).forEach(pred => {
                            if ( pred.image_id == request.params.imageId ) {
                                context.image.predictions = {};
                                pred.scores.forEach(score => {
                                    context.image.predictions[score.tag] = score.score;
                                });
                            }
                        });
                    });
            }
        }).then(() => {
            response.render('image', context);
        });
});

exports.expressApp = functions.https.onRequest(app);
