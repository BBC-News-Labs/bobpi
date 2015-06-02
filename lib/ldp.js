var Q = require('q'),
    http = require('http'),
    _ = require('underscore'),
    request = require('request'),
    NodeCache = require('node-cache'),
    md5 = require('MD5'),
    parseString = require('xml2js').parseString;


var myCache = new NodeCache({stdTTL: 300});

module.exports = new function() {
    
    this.getTagConcepts = function(tag) {
        var deferred = Q.defer();
        var options = {
            url: 'http://data.bbc.co.uk/ldp/tag-concepts?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm&search=' + tag,
            headers: {
                'Accept' : 'application/json-ld'
            },
        }
        request(options, function(error, response, body) {
          if(body && response.statusCode == 200) {
            deferred.resolve(body);
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
            this.getVideosObjectsFromGuid(guid)
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


    this._getguid = function(fullUrl) {
        return fullUrl.substring(28,64);
    }

    this.getTagConceptsTrendingByType = function(type, trendingConcepts) {
        var yesterday = this._getYesterdaysDate();
        var deferred = Q.defer();
        console.log('http://data.bbc.co.uk/ldp/tag-concepts-usage?api_key=rrnbeTUoajuHhTyUGE04msdolErjjrhm'+"&since=" + yesterday+ "&type=" + "core:"+type);
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

    this.getVideosObjectsFromGuid = function(guid) {
        var deferred = Q.defer();
        var self = this;
        this.getCworksFromGuid(guid)
        .then(function(cworks) {
            if (cworks instanceof Object) {
                deferred.resolve(self.getAssetsFromCandy(cworks));
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
        this.getCworksFromGuid(guid)
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

    this.getCworksFromGuid = function(guid) {
        var cachedValue = myCache.get(guid);
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

    this.getAssetsFromCandy = function(cworks) {
        var cacheKey = md5(JSON.stringify(cworks));
        var cachedValue = myCache.get(cacheKey);
        var deferred = Q.defer();
        var self = this;
        if (typeof(cworks.results) !== 'undefined' && cworks.results.length > 0) {
            if (cachedValue == undefined) {
                var deferred = Q.defer();
                var self = this;
                var curies = this.getCuries(cworks);
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
                        var tagsForIds = self.getTagsForIds(cworks);
                        var candyAssets = JSON.parse(body);
                        myCache.set(cacheKey, candyAssets);
                        deferred.resolve(candyAssets);
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
            deferred.resolve('');
        }
        
        return deferred.promise;
    }
};
