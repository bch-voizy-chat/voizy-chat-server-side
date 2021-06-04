const functions = require('firebase-functions');
const googleStorage  = require('@google-cloud/storage');
const express = require('express');
const cors = require('cors');
const saltedMd5 = require("salted-md5");
const path = require("path");
const { filesUpload } = require("./middleware");
const { format } = require("util");
const { v4: uuidv4 } = require("uuid");
const app = express();


const admin = require('firebase-admin');
admin.initializeApp({
  storageBucket: "gs://voizy-chat.appspot.com"
});
const bucket = admin
  .storage()
  .bucket("gs://voizy-chat.appspot.com");
const db = admin.firestore();




app.use(cors({ origin: true }));
app.use(express.urlencoded({extended: false}));
app.use(express.json());




//#### APIs ####


//#### Sign up ####
app.post("/signup", async (req, res) => {
    let results = {
        email: 0,
        username: 0
    };
    //check email
    await db
        .collection("users")
        .where("email", "==", req.body.email)
        .get()
        .then((doc) => {
            doc.forEach(query => {
                results.email += 1;
            });
        });
    if (results.email > 0) {
        res.status(406).send(
            JSON.stringify({
                message: "this email already exists in database!",
            })
        );
        return;
    } else {
        //check username
        await db
            .collection("users")
            .where("username", "==", req.body.username)
            .get()
            .then((doc) => {
                doc.forEach((query) => {
                    results.username += 1;
                });
            });
        if (results.username > 0) {
            res.status(406).send(
                JSON.stringify({
                    message: "this username already exists in database!",
                })
            );
            return;
        } else {
            // create new user
            await db
                .collection("users")
                .add({
                    username: req.body.username,
                    email: req.body.email,
                    password: req.body.password,
                })
                .then((docRef) => {
                    res
                        .status(201)
                        .send(
                            JSON.stringify({
                                message: `user with id: ${docRef.id} created`
                            })
                        );
                })
                .catch((error) =>
                    res.status(400).send(
                        JSON.stringify(error))
                );
        }
    }
});



// #### login ####
app.post("/login", async (req, res) => {
  //check email
  let results = {
    email: 0,
    id: "",
    password: 0,
  };
  await db
    .collection("users")
    .where("email", "==", req.body.email)
    .get()
    .then((doc) => {
      doc.forEach((query) => {
        results.email += 1;
        results.id = query.id;
      });
    });
  if (results.email > 0) {
    await db
      .collection("users")
      .doc(results.id)
      .get()
      .then((doc) => { 
        if (doc.data().password === req.body.password) {
          //log in
          res.status(200).send(
            JSON.stringify({
              email: req.body.email,
              password: req.body.password,
            })
          );
        } else {
          // wrong pass
          res.status(401).send(
            JSON.stringify({
              message: "wrong password!"
            })
          );
        }
      });
  } else {
    //No user with that email
    res.status(400).send(
      JSON.stringify({
        message: "no such user!",
      })
    );
  }
});



// #### get user by id ####
app.post("/getuser", async (req, res) => {
  await db.collection("users")
    .doc(req.body.userid)
    .get()
    .then((doc) => {
        res.status(200).send(
          JSON.stringify({
            userid: doc.id,
            username: doc.data().username,
          })
        );
    })
    .catch((error) => {
      res.status(400).send(
        JSON.stringify({
          message: "no such user!",
        })
      );
    });
})




// #### start thread ####
// create collection threads
// design thread get structure
//req.body: threadName, threadTags[],threadDate(),threadPosterUserId, threadPosterPassword threadAudio
//1- check user id and password and fetch username if valid, if not respond 400
//2 - add to threads collection, file path?
//3- respond with get threads
app.post("/addthread", filesUpload,identifyUser,uploadFile, async (req, res, next) => {
  //add to threads collection
  //res.locals.userName
  //res.locals.url
  //res.locals.filename
  //Date.now()
  //array of tags
  
  
});


/// Functions ///

// verify user identity
async function identifyUser(req, res, next) {
  await db
    .collection("users")
    .doc(req.body.userid)
    .get()
    .then((doc) => {
      if (doc.exists) {
        if (req.body.password === doc.data().password) {
          res.locals.userName = doc.data().username;
          next();
        } else {
          res.status(401).send(
            JSON.stringify({
              message: "wrong password!",
            })
          );
          return;
        }
      } else {
        res.status(401).send(
          JSON.stringify({
            message: "no such user id!",
          })
        );
        return;
      }
    });
};

// uploading the file
 function uploadFile(req, res, next) {
    if (!req.files.length) {
    res.send(
      JSON.stringify({
        message: "No file!",
      })
    );
    return;
  } else {
    const name = saltedMd5(req.files[0].originalname, "SUPER-S@LT!");
    const fileName = name + path.extname(req.files[0].originalname);
    let fileUpload = bucket.file(fileName);
    const downloadToken = uuidv4();
    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: req.files[0].mimetype,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });
    blobStream.on("error", (error) => {
      res.send("Something is wrong! Unable to upload" + error);
      return;
    });
      res.locals.url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${fileName}?alt=media&token=${downloadToken}`;
      res.locals.fileName = fileName;
    blobStream.end(req.files[0].buffer);
    next();
  }
};

exports.voizyChat = functions.https.onRequest(app);