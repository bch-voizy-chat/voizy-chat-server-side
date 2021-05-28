module.exports.UserLogedIn = function (userId, username, password) {
  this.userId = userId;
  this.username = username;
  this.password = password;
};

module.exports.UserDisplay = function (userId, username) {
  this.userId = userId;
  this.username = username;
};
