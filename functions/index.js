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
  //credential: admin.credential.applicationDefault(),
  storageBucket: "gs://voizy-chat.appspot.com"
});
const bucket = admin
  .storage()
  .bucket("gs://voizy-chat.appspot.com");
const db = admin.firestore();




app.use(
  cors({
    origin: "*",
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Content-Length",
      "X-Requested-With",
      "Accept",
    ],
    methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
  })
);
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
              userId: results.id,
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




// #### post thread ####

app.post("/addthread", filesUpload,identifyUser,uploadFile, async (req, res) => {
      await db
        .collection("threads")
        .add({
          threadAudioPath: res.locals.url,
          threadAudioName: res.locals.fileName,
          threadPosterId: req.body.userid,
          threadPosterUserName: res.locals.userName,
          threadPostDate: Date.now(),
          threadTags: JSON.parse(req.body.threadtags),
          threadLikes: 0,
          threadResponseCount: 0,
          threadTitle: req.body.threadTitle,
        })
        .then((docRef) => {
          res.status(201).send(
            JSON.stringify({
              message: `thread with id: ${docRef.id} created`,
            })
          );
        })
        .catch((error) =>
          res.status(400).send(
            JSON.stringify({
              message: "an error occured!" + error,
            })
          )
        );
});


// #### get threads ####

app.get("/threads", async (req, res) => {
  let threadsArray = [];
  await db
    .collection("threads")
    .get()
    .then((doc) => {
      doc.forEach((i) => {
        threadsArray.push({
          threadId: i.id,
          threadAudioPath: i.data().threadAudioPath,
          threadPostDate: i.data().threadPostDate,
          threadPosterUserName: i.data().threadPosterUserName,
          threadPostDate: i.data().threadPostDate,
          threadTags: i.data().threadTags,
          threadLikes: i.data().threadLikes,
          threadResponseCount: i.data().threadResponseCount,
          threadTitle: i.data().threadTitle
        });
      });
    })
    .then((e) => res.status(200).send(JSON.stringify(threadsArray)))
    .catch((err) => res.status(400).send(
        JSON.stringify({
          message: "an error occured!" + err,
        })
      ));
})

// #### add response ####
app.post(
  "/addresponse",
  filesUpload,
  identifyUser,
  uploadFile,
  async (req, res, next) => {
    await db
      .collection("threads")
      .doc(req.body.threadId)
      .get()
      .then((doc) => {
        if (!doc.exists) {
          res.status(401).send(
            JSON.stringify({
              message: "no such thread id!",
            })
          );
          return;
        } else {
           db
            .collection("threads")
            .doc(req.body.threadId)
            .collection("responses")
            .add({
              responseAudioPath: res.locals.url,
              responseAudioName: res.locals.fileName,
              responsePosterId: req.body.userid,
              responsePosterUserName: res.locals.userName,
              responsePostDate: Date.now(),
              responseLikes: 0,
              responseToThreadId: req.body.threadId,
            })
            .then((docRef) => {
              res.status(201).send(
                JSON.stringify({
                  message: `response with id: ${docRef.id} created`,
                })
              );
              next();
            })
            .catch((error) =>{
              res.status(400).send(
                JSON.stringify({
                  message: "an error occured!" + error,
                })
              );
              return;
            }
           );
          db.collection("threads")
            .doc(req.body.threadId)
            .update({
              threadResponseCount: admin.firestore.FieldValue.increment(1),
            });
          return;
        }
      });
  }
);

// #### get thread + responses ####

app.get("/threads/:threadId", async (req, res) => {
  let responseArray = [];
  let thread = {};
  
  await db
    .collection("threads")
    .doc(req.params.threadId)
    .get()
    .then((i) => {
      thread.threadId = i.id;
      thread.threadAudioPath = i.data().threadAudioPath;
      thread.threadPostDate = i.data().threadPostDate;
      thread.threadPosterUserName = i.data().threadPosterUserName;
      thread.threadPostDate = i.data().threadPostDate;
      thread.threadTags = i.data().threadTags;
      thread.threadLikes = i.data().threadLikes;
      thread.threadResponseCount = i.data().threadResponseCount;
      thread.threadTitle= i.data().threadTitle;
    });
    
  await db
    .collection("threads")
    .doc(req.params.threadId)
    .collection("responses")
    .get()
    .then((doc) => {
      doc.forEach((i) => {
        responseArray.push({
          responseId: i.id,
          responseToThreadId: i.data().responseToThreadId,
          responseAudioPath: i.data().responseAudioPath,
          responsePostDate: i.data().responsePostDate,
          responsePosterUserName: i.data().responsePosterUserName,
          responsePostDate: i.data().responsePostDate,
          responseLikes: i.data().responseLikes,
        });
      });
    })

    .then((e) => res.status(200).send(JSON.stringify({thread:thread,responses:responseArray})))
    .catch((err) =>
      res.status(400).send(
        JSON.stringify({
          message: "an error occured!" + err,
        })
      )
    );
})

// #### Like thread ####
app.post(
  "/likeThread",
  identifyUser,
  async (req, res) => {
    db.collection("threads")
      .doc(req.body.threadId)
      .update({
        threadLikes: admin.firestore.FieldValue.increment(1),
      })
      .then((i) =>
        res.status(200).send(
          JSON.stringify({
            message: "like added!",
          })
        )
      )
      .catch((e) =>
        res.status(400).send(
          JSON.stringify({
            message: "an error occured!" + err
          })
        )
      );
    return
  })

// #### Like response ####
app.post("/likeResponse", identifyUser, async (req, res) => {
  db.collection("threads")
    .doc(req.body.threadId)
    .collection("responses")
    .doc(req.body.responseId)
    .update({
      responseLikes: admin.firestore.FieldValue.increment(1),
    })
    .then((i) =>
      res.status(200).send(
        JSON.stringify({
          message: "like added!",
        })
      )
    )
    .catch((e) =>
      res.status(400).send(
        JSON.stringify({
          message: "an error occured!" + err,
        })
      )
    );
  return;
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
    res.status(401).send(
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
      res.status(400).send(
        JSON.stringify({
          message: "an error occured!" + error,
        })
      );
      return;
    });
      res.locals.url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${fileName}?alt=media&token=${downloadToken}`;
      res.locals.fileName = fileName;
    blobStream.end(req.files[0].buffer);
    next();
  }
};

exports.voizyChat = functions.https.onRequest(app);