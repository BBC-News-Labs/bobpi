var Q = require('q'),
    http = require('http'),
    _ = require('underscore'),
    request = require('request'),
    NodeCache = require('node-cache'),
    md5 = require('MD5'),
    parseString = require('xml2js').parseString;


var myCache = new NodeCache({stdTTL: 300});

module.exports = new function() {
    
    this.getTagConcepts = function(tag, i) {
        var deferred = Q.defer();
        var options = {
            url: 'http://data.bbc.co.uk/ldp/tag-concepts?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm&search=' + tag,
            headers: {
                'Accept' : 'application/json-ld'
            },
        }
        request(options, function(error, response, body) {
            console.log("getting concepts");
          if(body && response.statusCode == 200) {
            //horrible hax to allow async calling in for loop
            if (typeof i !== undefined) {
                deferred.resolve({
                    "i" : i,
                    "body" : JSON.parse(body)
                })
            } else {
                deferred.resolve({
                    "i" : i,
                    "body" : JSON.parse(body)
                })
            }
            
          }
        });
        return deferred.promise;
    }

    this.getTagConceptsTrending = function() {
        var conceptCount = 20;
        var trendingConcepts = {};
        var deferred = Q.defer();
        var self = this;
        var cachedValue = myCache.get( "trendingConcepts");
        if (cachedValue == undefined) {
            this.getTagConceptsTrendingByType('Event', trendingConcepts)
            //.then(_.bind(this.getTagConceptsTrendingByType, this, 'Organisation', trendingConcepts))
            // .then(_.bind(this.getTagConceptsTrendingByType, this, 'Person', trendingConcepts))
            // .then(_.bind(this.getTagConceptsTrendingByType, this, 'Place', trendingConcepts))
            // .then(_.bind(this.getTagConceptsTrendingByType, this, 'Theme', trendingConcepts))
            .then(function() {
                var deferred = Q.defer();
                var removedGroups = self._removeGroups(trendingConcepts);
                var orderedByTagCount = self._orderByTagCount(removedGroups);
                myCache.set( "trendingConcepts", orderedByTagCount);
                deferred.resolve(orderedByTagCount)
                return deferred.promise;
            })
            .then(_.bind(self._fetchFirstStoryImages, this))
            .then(function(all) {

                var withImages = _.filter(all, function (item) {
                    return item.image;
                })
                var result = withImages.splice(0, conceptCount);
                myCache.set("trendingConcepts", result);
                deferred.resolve(result);
            });
        } else {
            deferred.resolve(cachedValue);
        }

        return deferred.promise;
    }

    this.getStoriesById = function(id) {
        var deferred = Q.defer();
        var self = this;
        var guid = this._getguid(id);
        var cachedValue = myCache.get(guid+"stories");
        if (cachedValue == undefined) {
            this.getVideoObjectsFromGuid(guid)
            .then(_.bind(self._amendVideoUrls, this))
            .then(function(candyAssets){
                console.log(candyAssets.results[0]);
                simplified = self._flattenAndSimplify(candyAssets);
                myCache.set(guid+"stories", simplified);
                deferred.resolve(simplified);
            })
        } else {
            deferred.resolve(cachedValue);
        }
        return deferred.promise;
    }

    this.getCrossoverStories = function(tags) {
        var deferred = Q.defer();
        var self = this;
        var tagsArray = tags.split(",");
        var storiesArray = [];
        var count = 0;
        //var guid = this._getguid(id);
        var cachedValue = myCache.get(tags+"crossover");
        if (cachedValue == undefined) {
            for (var i = 0; i < tagsArray.length; i++) {
                this.getTagConcepts(tagsArray[i], i)
                .then(function(tagConcepts){
                    if (typeof tagConcepts.body.results == 'undefined') {
                        return {
                                    "i" : tagConcepts.i,
                                    "guid" : ""
                                }
                    }
                    for (var j = 0; j < tagConcepts.body.results.length; j++) {
                        if (tagConcepts.body.results[j]["domain:canonicalName"].toLowerCase() === tagsArray[tagConcepts.i].toLowerCase()) {
                            return {
                                    "i" : tagConcepts.i,
                                    "guid" : self._getguid(tagConcepts.body.results[j]["@id"])
                                }
                        } else {
                            return {
                                    "i" : tagConcepts.i,
                                    "guid" : ""
                                }
                        } 

                    };
                })
                .then(_.bind(self.getStoryObjectsFromGuid,this))
                .then(function(results){
                    if (typeof results.body !== "undefined" && typeof results.body.results !== "undefined") {
                        storiesArray[results.i] = results.body.results;
                    }
                    count = count + 1;
                    if (count == tagsArray.length) {
                        var correllated = self._correllate(storiesArray);
                        // svar correllated = storiesArray;

                        myCache.set(tags+"crossover", correllated);
                        deferred.resolve(correllated);
                    
                    }
                })
               
                
            };
            
        } else {
            deferred.resolve(cachedValue);
        }
        return deferred.promise;
    }
    this._getguid = function(fullUrl) {
        return fullUrl.substring(28,64);
    }

    this.getTagConceptsTrendingByType = function(type, trendingConcepts) {
        var yesterday = this._getYesterdaysDate();
        var deferred = Q.defer();
        var options = {
            url: 'http://data.bbc.co.uk/ldp/tag-concepts-usage?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm'+"&since=" + yesterday+ "&type=" + "core:"+type,
            headers: {
                'Accept' : 'application/json-ld'
            },
        }
        request(options, function(error, response, body) {
            if(body && response.statusCode == 200) {
                trendingConcepts[type] = JSON.parse(body);
                deferred.resolve(trendingConcepts);
            }
        });
        return deferred.promise;
    }

    this._getYesterdaysDate = function () {
        var date = new Date();
        date.setDate(date.getDate() - 1);
        var month = date.getMonth() + 1;
        return date.getFullYear() + '-'+ (month < 10 ? '0' : '') + month + '-' + (date.getDate() < 10 ? '0' : '') + date.getDate();
    }

    // NOTE THIS IS BROKEN NOW!!!!! need to line up with getStoryObjectsFromGuid

    this.getVideoObjectsFromGuid = function(guid) {
        var deferred = Q.defer();
        var self = this;
        this.getVideoCworksFromGuid(guid)
        //.then(_.bind(self.getAssetsFromCandy, this))
        .then(function(cworks) {
            if (cworks instanceof Object) {
                deferred.resolve(self.getAssetsFromCandy(cworks));
            } else {
                deferred.resolve('');
            }
        });
        return deferred.promise;
    }

    this.getStoryObjectsFromGuid = function(guidAndI) {
        var deferred = Q.defer();
        var self = this;
        var collectedResults = {
                "i": guidAndI.i,
                "cworks": {
                    "results":[] 
                }
            };
        if (guidAndI.guid == "") {
            return collectedResults;
        }
        this.getCworksFromGuidPage(guidAndI.guid, guidAndI.i, 1)
        .then(function(assets1) {
            if (typeof assets1.cworks.results !== 'undefined') {
                for (var i = 0; i < assets1.cworks.results.length; i++) {
                    collectedResults.cworks.results.push(assets1.cworks.results[i]);
                };
            }
            return collectedResults;
        })
        .then(_.bind(self.getCworksFromGuidPage, this, guidAndI.guid, guidAndI.i, 2))
        .then(function(assets2) {
            if (typeof assets2.cworks.results !== 'undefined') {
                for (var i = 0; i < assets2.cworks.results.length; i++) {
                    collectedResults.cworks.results.push(assets2.cworks.results[i]);
                };
            }
            
            return collectedResults;
        })
        .then(_.bind(self.getCworksFromGuidPage, this, guidAndI.guid, guidAndI.i, 3))
        .then(function(assets3) {
            if (typeof assets3.cworks.results !== 'undefined') {
                for (var i = 0; i < assets3.cworks.results.length; i++) {
                    collectedResults.cworks.results.push(assets3.cworks.results[i]);
                };
            }
            return collectedResults;
        })
        .then(_.bind(self.getCworksFromGuidPage, this, guidAndI.guid, guidAndI.i, 4))
        .then(function(assets4) {
            if (typeof assets4.cworks.results !== 'undefined') {
                for (var i = 0; i < assets4.cworks.results.length; i++) {
                    collectedResults.cworks.results.push(assets4.cworks.results[i]);
                };
            }
            //console.log("CWORKS SHOULD BE 80", collectedResults.cworks.results.length);
            //console.log(collectedResults.cworks.results);
            return collectedResults;
        })
        // .then(_.bind(self.getCworksFromGuidPage, this, guidAndI.guid, guidAndI.i, 5))
        // .then(function(assets5) {
        //     //if (typeof assets5.cworks.results !== undefined && assets5.cworks.results.length > 0) {
        //     for (var i = 0; i < assets5.cworks.results.length; i++) {
        //         collectedResults.cworks.results.push(assets5.cworks.results[i]);
        //     };
        //     console.log("CWORKS SHOULD BE 100", collectedResults.cworks.results.length);
        //     //}
            
        //     //console.log(collectedResults.cworks.results);
        //     return collectedResults;
        // })
        // .then(_.bind(self.getCworksFromGuidPage, this, guidAndI.guid, guidAndI.i, 5))
        // .then(function(assets5) {
        //     for (var i = 0; i < assets5.cworks.results.length; i++) {
        //         collectedResults.cworks.results.push(assets5.cworks.results[i]);
        //     };
        //     return collectedResults;
        // })
        // .then(_.bind(self.getCworksFromGuidPage, this, guidAndI.guid, guidAndI.i, 4))
        // .then(function(assets3) {
        //     //console.log(assets1);
        //     collectedResults.cworks.results.push(assets4.cworks.results);
        //     console.log("lebngth of results", collectedResults.cworks.results.length);
        //     // console.log(collectedResults);
        //     // console.log(collectedResults.cworks.results);
        //     //cworks.

        //     return collectedResults;
        // })
        // .then(_.bind(self.getCworksFromGuidPage, this, guidAndI.guid, guidAndI.i, 5))
        // .then(function(assets3) {
        //     //console.log(assets1);
        //     collectedResults.cworks.results.push(assets5.cworks.results);
        //     // console.log(collectedResults);
        //     console.log("lebngth of results", collectedResults.cworks.results.length);
        //     //cworks.

        //     return collectedResults;
        // })
        .then(_.bind(self.getAssetsFromCandy, this))
        .then(function(cworks) {
            
            if (cworks instanceof Object) {
                deferred.resolve({
                    "i": cworks.i,
                    "body": cworks.assets
                });
            } else {
                deferred.resolve('');
            }
        });
        return deferred.promise;
    }

    this._flattenAndSimplify = function(candyAssets) {
        var simplified = [];
        if (typeof(candyAssets.results) !== 'undefined' && candyAssets.results.length > 0) {
            for (var i = 0; i < candyAssets.results.length; i++) {
                var item = {};
                item.title = candyAssets.results[i].title;
                item.summary = candyAssets.results[i].summary;
                for (var property in candyAssets.results[i].media.images.index) {
                    if (candyAssets.results[i].media.images.index.hasOwnProperty(property)) {
                        item.imageSrc = candyAssets.results[i].media.images.index[property].href;
                    }
                }
                item.mp4 = candyAssets.results[i].mp4;
                simplified.push(item);
            };
            return simplified;
        } else {
            return {};
        }
    }

    this._removeGroups = function(trendingConcepts) {
        var simplified = [];

        for (var property in trendingConcepts) {
            if (trendingConcepts.hasOwnProperty(property)) {
                for (var thing in trendingConcepts[property].results) {
                    simplified.push(trendingConcepts[property].results[thing]);
                }
            }
        }
        return simplified;
    }

    this._orderByTagCount = function(trendingConcepts) {
        trendingConcepts.sort(this._dynamicSort('-metric:tagUsageCount'));
        return trendingConcepts;
    }

    this._dynamicSort = function(property) {
        var sortOrder = 1;
        if(property[0] === "-") {
            sortOrder = -1;
            property = property.substr(1);
        }
        return function (a,b) {
            var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
            return result * sortOrder;
        }
    }

    this._fetchFirstStoryImages = function(orderedByTagCount) {
        var deferred = Q.defer();
        var images = [];
        var self = this;
        var offset = 0;
        var returnObject = orderedByTagCount;
        for (var i = 0; i < returnObject.length; i++) {
            var guid = this._getguid(returnObject[i]['@id']);
            this._fetchFirstImage(guid, i)
            .then(function(imageObject){
                    returnObject[imageObject.i]['image'] = imageObject.src;
                    images.push(imageObject.src);
                if (images.length == (returnObject.length)) {
                    deferred.resolve(returnObject);
                }
            });
        };
        return deferred.promise;
    }

    this._amendVideoUrls = function(candyAssets) {
        var deferred = Q.defer();
        var urls = [];
        if (typeof(candyAssets.results) !== 'undefined' && candyAssets.results.length > 0) {
            for (var i = 0; i < candyAssets.results.length; i++) {
                var mediaSelectorUrl = this._formatMediaSelectorUrl(candyAssets.results[i]);
                this._fetchVideoUrlFromMediaSelector(mediaSelectorUrl, i)
                .then(function(videoUrlObject){
                    candyAssets.results[videoUrlObject.i]['mp4'] = videoUrlObject.src;
                    urls.push(videoUrlObject.src);
                    if (urls.length == (candyAssets.results.length)) {
                        deferred.resolve(candyAssets);
                    }
                });
            }
        }
        return deferred.promise;
    }

    this._fetchVideoUrlFromMediaSelector = function(url, i) {
        var cacheKey = url;
        var cachedValue = myCache.get(cacheKey);
        var deferred = Q.defer();
        var self = this;
        var urlBase = "http://news.downloads.bbc.co.uk.edgesuite.net/"

        if (cachedValue == undefined) {
            var deferred = Q.defer();
            var self = this;
            
            var options = {
                url: url
            }
            request(options, function(error, response, body) {
              if(body && response.statusCode == 200) {
                var mp4Component = self._fetchMp4ComponentFromXml(body);
                var fullUrl = urlBase + mp4Component;
                var returnObject = {
                            'src' : fullUrl,
                            'i' : i
                        }
                myCache.set(cacheKey, fullUrl);
                deferred.resolve(returnObject);
              } else {
                myCache.set(cacheKey, '');
                deferred.resolve('');
              }
            });
        } else {
            var returnObject = {
                            'src' : cachedValue,
                            'i' : i
                        }
            deferred.resolve(returnObject);
        }
        return deferred.promise;
    }

    this._fetchMp4ComponentFromXml = function (xml) {
        var deferred = Q.defer();
        var trimmed = parseString(xml, function(err, result){
            for (var i = 0; i < result.mediaSelection.media.length; i++) {
                if (result.mediaSelection.media[i]["$"].bitrate === "1500") {
                    var mp4Component = result.mediaSelection.media[i].connection[0]["$"].identifier;
                    console.log(mp4Component.substr(11, mp4Component.length));
                    var trimmed = mp4Component.substr(11, mp4Component.length)
                    
                    deferred.resolve( trimmed );
                }
            };
        });
        return deferred.promise;
    }

    this._formatMediaSelectorUrl = function(asset) {
        var urlBase = "http://open.live.bbc.co.uk/mediaselector/5/select/version/2.0/mediaset/journalism-pc/vpid/";
        var vpid;
        var guid = this._getguid(asset.id);
        for (var property in asset.media.videos.primary) {
            if (asset.media.videos.primary.hasOwnProperty(property)) {
                var vpid = asset.media.videos.primary[property].externalId;
            }
        }
        return urlBase + vpid;
    }

    this._fetchVideoUrl = function(candyAssets) {
        // if (typeof(candyAssets.results) !== 'undefined' && candyAssets.results.length > 0) {
        //     //if (candyAssets.results.length) {
        //         for (var property in candyAssets.results[0].media.images.index) {

        //             if (candyAssets.results[0].media.images.index.hasOwnProperty(property)) {
        //                 var imageSrc = candyAssets.results[0].media.images.index[property].href;
                        
        //                 var returnObject = {
        //                     'src' : imageSrc,
        //                     'i' : i
        //                 }
        //                 deferred.resolve(returnObject);
        //             }
        //         }
        //     } else {
        //         var returnObject = {
        //             'i' : i
        //         }
        //         deferred.resolve(returnObject);
        //     }
    }

    this._fetchFirstImage = function(guid, i) {
        var deferred = Q.defer();
        var self = this;
        // /var cworks = 
        //deferred.resolve(this.getCworksFromGuid(guid).results);
        this.getVideoCworksFromGuid(guid)
        .then(_.bind(self.getAssetsFromCandy, this))
        .then(function(candyAssets) {
            if (typeof(candyAssets.results) !== 'undefined' && candyAssets.results.length > 0) {
            //if (candyAssets.results.length) {
                for (var property in candyAssets.results[0].media.images.index) {

                    if (candyAssets.results[0].media.images.index.hasOwnProperty(property)) {
                        var imageSrc = candyAssets.results[0].media.images.index[property].href;
                        
                        var returnObject = {
                            'src' : imageSrc,
                            'i' : i
                        }
                        deferred.resolve(returnObject);
                    }
                }
            } else {
                var returnObject = {
                    'i' : i
                }
                deferred.resolve(returnObject);
            }
        });
        return deferred.promise;
    }

    this.getVideoCworksFromGuid = function(guid) {
        var cachedValue = myCache.get(guid+"videos");
        var deferred = Q.defer();
        var self = this;
        //http://data.bbc.co.uk/ldp/creative-works-v2?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm&about=3afab96b-01da-496b-a8b4-d0aba98d26ab&format=VideoFormat
            if (cachedValue == undefined) {
                var options = {
                    url: 'http://data.bbc.co.uk/ldp/creative-works-v2?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm&about=' + guid +'&format=VideoFormat',
                    headers: {
                        'Accept' : 'application/json-ld'
                    },
                }
                request(options, function(error, response, body) {
                    var bodyObject = JSON.parse(body);
                    if(bodyObject instanceof Object && response.statusCode == 200) {
                        if (Object.keys(bodyObject).length > 0) {
                            myCache.set( guid, bodyObject);
                            deferred.resolve(bodyObject);
                        } else {
                            myCache.set( guid, '');
                            deferred.resolve(bodyObject);
                        }
                    } else {
                        myCache.set( guid, bodyObject);
                        deferred.resolve(bodyObject);
                    }
                })
            } else {
                deferred.resolve(cachedValue);
            }
        return deferred.promise;
    }

    this.getCworksFromGuid = function(guid, i) {
        var cachedValue = myCache.get(guid+"stories");
        var deferred = Q.defer();
        var self = this;
        //http://data.bbc.co.uk/ldp/creative-works-v2?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm&about=3afab96b-01da-496b-a8b4-d0aba98d26ab&format=VideoFormat
            if (cachedValue == undefined) {
                var options = {
                    url: 'http://data.bbc.co.uk/ldp/creative-works-v2?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm&about=' + guid ,
                    headers: {
                        'Accept' : 'application/json-ld'
                    },
                }
                request(options, function(error, response, body) {
                    var bodyObject = JSON.parse(body);
                    if(bodyObject instanceof Object && response.statusCode == 200) {
                        if (Object.keys(bodyObject).length > 0) {
                            myCache.set( guid, bodyObject);
                            if (typeof i !== undefined) {
                                console.log("got the cworks for i = " + i);
                                deferred.resolve({
                                    "i" : i,
                                    "cworks" : bodyObject
                                });
                            }
                            
                        } else {
                            myCache.set( guid, '');
                            deferred.resolve(bodyObject);
                        }
                    } else {
                        myCache.set( guid, bodyObject);
                        deferred.resolve(bodyObject);
                    }
                })
            } else {
                deferred.resolve(cachedValue);
            }
        return deferred.promise;
    }

    this.getCworksFromGuidPage = function(guid, i, page) {
        var cachedValue = myCache.get(guid+"stories");
        var deferred = Q.defer();
        var self = this;
        if (guid !== "") {
            
        //http://data.bbc.co.uk/ldp/creative-works-v2?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm&about=3afab96b-01da-496b-a8b4-d0aba98d26ab&format=VideoFormat
            if (cachedValue == undefined) {
                console.log("getting cworks for ", guid, 'http://data.bbc.co.uk/ldp/creative-works-v2?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm&about=' + guid+"&page="+page);
                var options = {
                    url: 'http://data.bbc.co.uk/ldp/creative-works-v2?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm&about=' + guid ,
                    headers: {
                        'Accept' : 'application/json-ld'
                    },
                }
                request(options, function(error, response, body) {
                    var bodyObject = JSON.parse(body);
                    if(bodyObject instanceof Object && response.statusCode == 200) {
                        if (Object.keys(bodyObject).length > 0) {
                            myCache.set( guid, bodyObject);
                            if (typeof i !== undefined) {
                                console.log("got the cworks for i = " + i);
                                deferred.resolve({
                                    "i" : i,
                                    "cworks" : bodyObject
                                });
                            }
                            
                        } else {
                            myCache.set( guid, '');
                            deferred.resolve(bodyObject);
                        }
                    } else {
                        myCache.set( guid, bodyObject);
                        deferred.resolve(bodyObject);
                    }
                })
            } else {
                deferred.resolve(cachedValue);
            }
        } else {
            deferred.resolve({
                "i" : i,
                "cworks" : {}
            });
        }
        return deferred.promise;
    }


    this.getCuries = function (cworks) {
        var curies = [];
        for (var i = 0; i < cworks.results.length; i++) {
            if (cworks.results[i].locator.constructor === Array && typeof cworks.results[i].locator.length != 'undefined') {
                for (var j = 0; j < cworks.results[i].locator.length; j++) {
                    var string = String;
                    string = cworks.results[i].locator[j];
                    if (string.match(/^urn:asset.*/)) {
                        curies.push(string.match(/asset.*/)[0]);
                    }
                };
            }
        };
        return curies;
    }

    this.getTagsForIds = function (cworks) {
        var tagsForIds = {};
        for (var i = 0; i < cworks.results.length; i++) {
            if (cworks.results[i].locator.constructor === Array && typeof cworks.results[i].locator.length != 'undefined') {
                for (var j = 0; j < cworks.results[i].locator.length; j++) {
                    var string = String;
                    string = cworks.results[i].locator[j];
                    if (string.match(/^urn:asset.*/)) {
                        var id = string.match(/asset.*/)[0];
                        tagsForIds[id.replace(":", "/")] = cworks.results[i].about;
                    }
                };
            }
        };
        return tagsForIds;
    }

    this.addTagsToCandyAssets = function(tagsForIds, candyAssets) {
        for (var i = 0; i < candyAssets.results.length; i++) {
            var key = candyAssets.results[i].id.match(/asset.*/);
            candyAssets.results[i].about = tagsForIds[key[0]];
        };
        return candyAssets;
    }

    this.getAssetsFromCandy = function(assetObject) {
        var cacheKey = md5(JSON.stringify(assetObject.cworks));
        var cachedValue = myCache.get(cacheKey);
        var deferred = Q.defer();
        var self = this;
        if (typeof(assetObject.cworks.results) !== 'undefined' && assetObject.cworks.results.length > 0) {
            if (cachedValue == undefined) {
                var deferred = Q.defer();
                var self = this;
                var curies = this.getCuries(assetObject.cworks);
                if (curies.length > 0) {
                    var query_string = "curie=" + curies.join("&curie=");
                    var options = {
                        url: "http://data.bbc.co.uk/contentapiext/batch?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm&"+query_string,
                        headers: {
                            'Accept' : 'application/json',
                            'X-Candy-Audience' : 'Domestic',
                            'X-Candy-Platform' : 'Mobile'
                        },
                    }
                    request(options, function(error, response, body) {
                      if(body && response.statusCode == 200) {
                        console.log("i got something from candy");
                        var tagsForIds = self.getTagsForIds(assetObject.cworks);
                        var candyAssets = JSON.parse(body);
                        myCache.set(cacheKey, candyAssets);
                        if (typeof assetObject.i !== undefined) {
                            deferred.resolve({
                                "i" : assetObject.i,
                                "assets" : candyAssets
                            });
                        }
                      } else {
                        myCache.set(cacheKey, '');
                        deferred.resolve('');
                      }
                    });
                } else {
                    myCache.set(cacheKey, '');
                    deferred.resolve('');
                }
            } else {
                deferred.resolve(cachedValue);
            }
        } else {
            myCache.set(cacheKey, '');
            deferred.resolve({
                                "i" : assetObject.i,
                                "assets" : []
                            });
        }
        
        return deferred.promise;
    }

    this._correllate = function(storiesInGroups) {
        var returnArray = [];
        for (var i = 0; i < storiesInGroups.length; i++) {
            // remove cacked ones from non-tags... I know i shouldn't have let it get this fart.
            if (typeof storiesInGroups[i] == "undefined") {
                storiesInGroups.splice(i, 1);
            }
        }
        for (var i = 0; i < storiesInGroups.length; i++) {
            if (typeof storiesInGroups[i+1] !== 'undefined' && typeof storiesInGroups[i] !== 'undefined') {
                for (var j = i+1; j < storiesInGroups.length; j++) {
                    //console.log("i", i, "j", j, storiesInGroups[i][j].id);
                    for (var k = 0; k < storiesInGroups[i].length; k++) {
                        //storiesInGroups[k];
                        //storiesInGroups[i][j].id
                        for (var l = 0; l < storiesInGroups[j].length; l++) {
                            //console.log("i=", i, "j=",j, "k=", k, "l=",l);
                            //console.log( storiesInGroups[i][k].id ," = ", storiesInGroups[j][l].id)

                            if (storiesInGroups[i][k].id == storiesInGroups[j][l].id) {
                                var matched = 0;
                                //console.log("A MATCH!!!!!!!", storiesInGroups[i][k].id);
                                //if (returnArray)
                                for (var m = 0; m < returnArray.length; m++) {
                                    if (returnArray[m].id == storiesInGroups[i][k].id) {
                                        matched = 1;
                                    }
                                };
                                if (matched == 0) {
                                    returnArray.push(storiesInGroups[i][k]);
                                }
                            }
                            //console.log("i+1", i+1, "k", k, storiesInGroups[i+1][k].id);
                        };
                    };
                    
                };
            };
            //storiesInGroups[i].
        };
        return returnArray;
    }
};
