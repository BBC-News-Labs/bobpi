var express = require('express');
var Q = require('q');
var router = express.Router();
var ldp = require(__dirname + '/../lib/ldp');

/* GET home page. */
// router.get('/', function(req, res) {
//     // var obj = ldp.getTagConcepts('London');
//     // console.log(obj);
//     // var deferred = Q.defer();
//     //     var obj = ldp.getTagConcepts(tag);
//     //     console.log(deferred.resolve(obj));
//     //    return obj;
    
//     //res.send(obj);
    

    
// });

module.exports = new function() {
    this.getTagConcepts = function (req, res, next) {
        var tag = req.param('tag');            
        ldp.getTagConcepts(tag)
        .then(function(concepts) {
            res.send(concepts);
        });
    }
    this.getTagConceptsTrending = function (req, res, next) {
        ldp.getTagConceptsTrending()
        .then(function(concepts) {
            res.jsonp(concepts);
        });
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");
    }
    this.getStoriesById = function (req, res, next) {
        console.log(req.query);
        var id = req.query.id; 
        ldp.getStoriesById(id)
        .then(function(stories) {
            res.jsonp(stories);
        });
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");
    }
    this.getCrossover = function (req, res, next) {
        console.log(req.query.tags);
        var id = req.query.tags; 
        ldp.getCrossoverStories(id)
        .then(function(stories) {
            res.jsonp(stories);
        });
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");
    }
};
