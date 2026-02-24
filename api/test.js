const express = require("express");
const testApp = express();
testApp.all("*", (req, res) => {
  res.json({ works: true, path: req.path, url: req.url });
});
module.exports = testApp;
