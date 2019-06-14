import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

admin.initializeApp(functions.config().firebase);

let db = admin.firestore();

export const helloWorld = functions.https.onRequest((request, response) => {
    let corpusRef = db.collection('corpus');
    return corpusRef.limit(1).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                console.log(doc.id, '=>', doc.data());
            });
        })
        .then(() => {
            response.send("Hello");
        })
        .catch(err => {
            console.log('Error getting documents', err);
        })
});
