const rp = require('request-promise-native');
const cheerio = require('cheerio');
const _ = require('lodash');
const Bluebird = require('bluebird');
const microdata = require('microdata-node');
const metascraper = require('metascraper');
const got = require('got');

exports.handler = function(event, context, callback) {
    var headers = event.headers;
    headers = ConvertKeysToLowerCase(headers);
    var request = ConvertKeysToLowerCase(JSON.parse(event.body));
/*     if(headers["content-type"] != null && headers["content-type"].toLowerCase() != "application/json"){
        var body = {
            "error": "the server can only accept data in the application/json format"
        };
        var response = {
            "statusCode": 406,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials" : true
            },
            "body": JSON.stringify(body),
            "isBase64Encoded": false
        };
        return callback(null, response);
    } */
    if(request == null || request == ""){
        var body = {
            "error": "empty request",
            "explanation": "The CloudCite API did not receive any information in the request."
        };
        var response = {
            "statusCode": 400,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials" : true
            },
            "body": JSON.stringify(body),
            "isBase64Encoded": false
        };
        return callback(null, response);
    }
    switch (request.format) {
        case 'website':
            if(request.url == null || request.url == ""){
                var body = {
                    "error": "expected website URL",
                    "explanation": "The CloudCite API did not receive a valid URL to cite."
                };
                var response = {
                    "statusCode": 422,
                    "headers": {
                        "Access-Control-Allow-Origin" : "*",
                        "Access-Control-Allow-Credentials" : true
                    },
                    "body": JSON.stringify(body),
                    "isBase64Encoded": false
                };
                return callback(null, response);
            }
            var options = {
                timeout: 4000
            };
            (async () => {
                const {body: html, url} = await got(request.url, options)
                const meta = await metascraper({html, url})
                return meta; // remove duplicate request (got uses request) and merge with rp below
            })().then((meta) => {
                rp({
                    uri: request.url,
                    timeout: 4000,
                    transform: function(body) {
                        return cheerio.load(body);
                    }
                }).then(($) => {
                    var id = request.id == null ? "SET" : request.id;
                    var citation = {
                        "issued": {
                            "month": null,
                            "year": null,
                            "day": null
                        },
                        "id": id,
                        "author": [],
                        "title": null,
                        "publisher": null,
                        "note": null,
                        "container-title": null,
                        "container-title": null,
                        "source": null,
                        "genre": null,
                        "language": null,
                        "URL": request.url,
                        "abstract": null,
                        "type": "webpage"
                    };
                    var rootDomain = extractRootDomain(request.url).toLowerCase();
                    var html = $("html").html();
                    //console.log("HTML finished: " + html);
                    var schema = microdata.toJson(html);
                    var items = schema.items;
                    var publishers = []
                    $('div').each(function(i, elem) {
                        var text = $(this).text().replaceAll('\xa0',' ').replace(/[0-9]/g, '').trim();
                        var lower = text.toLowerCase();
                        if((lower.includes('©') || lower.indexOf('copyright') > 0) && (lower.indexOf('all rights reserved') > 0 || lower.length < 25)){
                          var start = text.indexOf("©") + 1;
                          var end = lower.substring(start).indexOf(".") + start;
                          if(end < 0){
                            var result = sanitizeInput(text.substring(start).trim());
                            if(result.length < 50 && result.length > 3){
                              publishers.push(result);
                            }
                          }
                          else{
                            var result = sanitizeInput(text.substring(start, end).trim());
                            if(result.length < 60 && result.length > 3){
                              publishers.push(result);
                            }
                          }
                        }
                    });
                    if(meta != null && meta.publisher != null && meta.publisher != ""){
                        publishers.push(meta.publisher);
                    }
                    if(meta != null && meta.description != null && meta.description != ""){
                        citation.abstract = meta.description;
                    }
                    citation.title = $('meta[property="og:title"]').attr('content');
                    if (citation.title == null || citation.title == "") {
                        citation.title = $('meta[name="og:title"]').attr('content');
                    }
                    if (citation.title == null || citation.title == "") {
                        citation.title = $('title').text();
                    }
                    citation.source = $('meta[property="og:site_name"]').attr('content');
                    if(citation.source == null || citation.source == ""){
                        citation.source = $('meta[name="og:site_name"]').attr('content');
                    }
                    if(citation.source == null || citation.source == ""){
                        for(var i = 0; i < items.length; i++){
                            if(items[i].type[0] == "http://schema.org/Organization"){
                                for(var j = 0; j < items[i].properties.name.length; j++){
                                    var org = items[i].properties.name[j];
                                    if(org != null && org != ""){
                                        citation.source = org;
                                    }
                                }
                            }
                        }
                    }
                    authors = [];       
                    authors.push($('meta[property="author"]').attr('content'));
                    authors.push( $('meta[name="author"]').attr('content'));
                    if(meta != null && meta.author != null && meta.author != ""){
                        authors.push(meta.author);
                    }
                    for(var i = 0; i < items.length; i++){
                      if(items[i].type[0] == "http://schema.org/Person"){
                        //console.log(items[i])
                        for(var j = 0; j < items[i].properties.name.length; j++){
                          authors.push(items[i].properties.name[j]);
                        }
                      }
                    }
                    for(var i = 0; i < authors.length; i++){
                        var temp = [];
                        if(authors[i] != null){
                            if(authors[i].indexOf(" and ") >= 0){
                                temp = authors[i].split(' and ');
                                authors[i] = null;
                                for(var j = 0; j < temp.length; j++){
                                    authors.push(temp[j]);
                                }
                            }
                        }
                    }
                    authors = _.uniq(authors);
                    authors = _.compact(authors)
                    for(var i = 0; i < authors.length; i++){
                        if(authors[i] != null){      
                            var fullName = authors[i].split(' ');
                            var firstName = fullName[0];
                            var middleName;
                            var lastName;
                            if(fullName.length >= 2){
                                lastName = fullName[fullName.length - 1];
                            }
                            if(fullName.length == 3){
                                middleName = fullName[fullName.length - 2];
                            }
                            if(fullName.length > 3){
                                for(var j = 1; j > fullName.length - 2; j++){
                                    firstName = firstName + " " + fullName[j];
                                }
                                middleName = fullName[fullName.length - 2];
                            }
                            if (middleName != null){
                                firstName = firstName + " " + middleName;
                            }
                            citation.author.push({given: firstName, family: lastName});
                        }
                    }
                    if(rootDomain == "youtu.be" || rootDomain == "youtube.com"){
                        var videoOwner = $('.yt-user-info > a').text();
                        if (videoOwner != null && videoOwner != ""){
                            citation.author.push({given: videoOwner});
                        }
                    }
                    if(rootDomain == "twitter.com" || (citation.source != null && citation.source.toLowerCase() == "twitter")){
                        for(var i = 0; i < citation.author.length; i++){
                            var fn = citation.author[i].given;
                            if(fn != null && fn != ""){
                                citation.author[i].given = "@" + fn;
                            }
                        }
                    }
                    if((publishers[0] == null || publishers[0] == "") && (citation.source != null && citation.source != "")){
                        citation.publisher = citation.source;
                    }
                    else{
                        citation.publisher = publishers[0]; 
                    }
                    if((citation.publisher != null && citation.publisher != "") && (citation.source == null || citation.source == "")){
                        citation.source = citation.publisher;
                    }
                    if(citation.publisher != null && citation.publisher != ""){
                        citation["container-title"] = citation.publisher;
                    }
                    else if(citation.source != null && citation.source != ""){
                        citation["container-title"] = citation.source;
                    }
                    var date;
                    date = $('meta[property="og:published_time"]').attr('content');
                    if (date == null || date == "") {
                        date = $('meta[property="article:published_time"]').attr('content');
                    }
                    if (date == null || date == "") {
                        date = $('meta[property="article:published"]').attr('content');
                    }
                    if (date == null || date == "") {
                        if(meta != null && meta.date != null && meta.date != ""){
                            date = meta.date;
                        }
                    }
                    if (date != null) {
                        date = new Date(date)
                        citation.issued.month = (date.getMonth() + 1).toString();
                        citation.issued.day = date.getDate().toString();
                        citation.issued.year = date.getFullYear().toString();
                    }
                    if(meta != null && meta.lang != null && meta.lang != ""){
                        citation.language = convertLang(meta.lang); //ISO 639-1
                    }
                    citation = JSON.stringify(citation)
                    //console.log('Citation: ' + citation)
                    var response = {
                        "statusCode": 200,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": citation,
                        "isBase64Encoded": false
                    };
                    callback(null, response);
                }).catch(function (err) {
                    console.log("Error in RP:" + err);
                    var body = {
                        "error": "cited website unavailable",
                        "explanation": "The CloudCite API was unable to access the website you wanted to cite."
                    };
                    var response = {
                        "statusCode": 422,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                });
            }).catch(function (err) {
                console.log("Error in GOT:" + err);
                var body = {
                    "error": "cited website unavailable",
                    "explanation": "The CloudCite API was unable to access the website you wanted to cite."
                };
                var response = {
                    "statusCode": 422,
                    "headers": {
                        "Access-Control-Allow-Origin" : "*",
                        "Access-Control-Allow-Credentials" : true
                    },
                    "body": JSON.stringify(body),
                    "isBase64Encoded": false
                };
                return callback(null, response);
            });
            break;              
        case 'movie':
            if((request.title == null || request.title == "") && (request.movie == null || request.movie == "")){
                var body = {
                    "error": "expected movie title or movie ID",
                    "explanation": "The CloudCite API did not receive a movie title or movie ID."
                };
                var response = {
                    "statusCode": 422,
                    "headers": {
                        "Access-Control-Allow-Origin" : "*",
                        "Access-Control-Allow-Credentials" : true
                    },
                    "body": JSON.stringify(body),
                    "isBase64Encoded": false
                };
                return callback(null, response);
            }
            if(request.movie == null || request.movie == ""){
                var page = "1";
                if(request.page != null && request.page != ""){
                    page = "" + request.page;
                }
                var url = "https://api.themoviedb.org/3/search/movie?api_key=" + process.env.TMDB_KEY + "&language=en-US&include_adult=false&query=" + request.title + "&page=" + page;
                rp({
                    uri: url,
                    method: 'GET',
                    timeout: 4000,
                    transform: function(body) {
                        return body;
                    }
                }).then((body) => {
                    var response = {
                        "statusCode": 200,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": body,
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                }).catch(function (err) {
                    console.log("Error in RP:" + err);
                    var body = {
                        "error": "movie not found",
                        "explanation": "The CloudCite API was unable to find the movie you wanted to cite or failed to cite your movie due to issues with the TMDb API."
                    };
                    var response = {
                        "statusCode": 404,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                });
            }
            else {
                var creditsURL = "https://api.themoviedb.org/3/movie/" + request.movie + "/credits?api_key=" + process.env.TMDB_KEY + "&language=en-US";
                var infoURL = "https://api.themoviedb.org/3/movie/" + request.movie + "?api_key=" + process.env.TMDB_KEY + "&language=en-US";

                var creditsOptions = {
                    uri: creditsURL,
                    method: 'GET',
                    timeout: 4000,
                    transform: function(body) {
                        return JSON.parse(body);
                    }
               }
               var infoOptions = {
                    uri: infoURL,
                    method: 'GET',
                    timeout: 4000,
                    transform: function(body) {
                        return JSON.parse(body);
                    }
                }

               var creditsRP = rp(creditsOptions);
               var infoRP = rp(infoOptions); 
               Bluebird.all([creditsRP, infoRP])
                   .spread(function (credits, details) {
                    var id = request.id == null ? "SET" : request.id;
                    var citation = {
                        "issued": {
                            "month": null,
                            "year": null,
                            "day": null
                        },
                        "id": id,
                        "director": [],
                        "title": null,
                        "publisher": null,
                        "publisher-place": null,
                        "source": null,
                        "abstract": null,
                        "type": "motion_picture"
                    };
                    var crew;
                    if(details != null && details.release_date != null){
                        var date = details.release_date.split("-");
                        if(date.length >= 1){
                            citation.issued.year = date[0];
                        }
                        if(date.length >= 2){
                            citation.issued.month = date[1];
                        }
                        if(date.length >= 3){
                            citation.issued.day = date[2];
                        }
                    }
                    if(details != null && details.overview != null){
                        citation.abstract = details.overview;
                    }
                    if(details != null && details.title != null){
                        citation.title = details.title;
                    }
                    if(details != null && details.production_companies != null){
                        if(details.production_companies.length >= 1){
                            citation.publisher = details.production_companies[0].name;
                        }
                    }
                    if(details != null && details.production_countries != null){
                        if(details.production_countries.length >= 1){
                            citation["publisher-place"] = details.production_countries[0].name;
                        }
                    }
                    var director = [];
                    if(credits != null && credits.crew != null){
                        crew = credits.crew;
                    }
                    for(var i = 0; i < crew.length; i++){
                        if(crew[i].job.toLowerCase() == "director"){
                            director.push(crew[i].name);
                        }
                    }
                    for(var i = 0; i < director.length; i++){
                        if(director[i] != null){      
                            var fullName = director[i].split(' ');
                            var firstName = fullName[0];
                            var middleName;
                            var lastName;
                            if(fullName.length >= 2){
                                lastName = fullName[fullName.length - 1];
                            }
                            if(fullName.length == 3){
                                middleName = fullName[fullName.length - 2];
                            }
                            if(fullName.length > 3){
                                for(var j = 1; j > fullName.length - 2; j++){
                                    firstName = firstName + " " + fullName[j];
                                }
                                middleName = fullName[fullName.length - 2];
                            }
                            if (middleName != null){
                                firstName = firstName + " " + middleName;
                            }
                            citation.director.push({given: firstName, family: lastName});
                        }
                    }
                    return JSON.stringify(citation);
                }).then((body) => {
                    var response = {
                        "statusCode": 200,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": body,
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                }).catch(function (err) {
                    console.log("Error in RP:" + err);
                    var body = {
                        "error": "movie ID not found",
                        "explanation": "The CloudCite API was unable to find the movie you wanted to cite or failed to cite your movie due to issues with the TMDb API."
                    };
                    var response = {
                        "statusCode": 404,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                });
            }
            break;
        case 'book':
            var search = (request.title == null || request.title == "") && (request.isbn == null || request.isbn == "") && (request.lccn == null || request.lccn == "") && (request.oclc == null || request.oclc == "") && (request.author == null || request.author == "") && (request.publisher == null || request.publisher == "");
            var details = (request.book == null || request.book == "");
            if(search && details){
                var body = {
                    "error": "expected book title or book id",
                    "explanation": "The CloudCite API did not receive a book title or book id."
                };
                var response = {
                    "statusCode": 422,
                    "headers": {
                        "Access-Control-Allow-Origin" : "*",
                        "Access-Control-Allow-Credentials" : true
                    },
                    "body": JSON.stringify(body),
                    "isBase64Encoded": false
                };
                return callback(null, response);
            }
            if(details){ // If details are unavailable, perform search
                var url = "https://www.googleapis.com/books/v1/volumes?maxResults=40&key=" + process.env.GOOGLE + "&q=";
                if(request.title != null && request.title != ""){
                    url = url + request.title;
                }
                else if(request.isbn != null && request.isbn != ""){
                    url = url + "isbn:" + request.isbn;
                }
                else if(request.lccn != null && request.lccn != ""){
                    url = url + "lccn:" + request.lccn;
                }
                else if(request.oclc != null && request.oclc != ""){
                    url = url + "oclc:" + request.oclc;
                }
                else if(request.author != null && request.author != ""){
                    url = url + "inauthor:" + request.author;
                }
                else if(request.publisher != null && request.publisher != ""){
                    url = url + "inpublisher:" + request.publisher;
                }
                else{
                    var body = {
                        "error": "expected book title, isbn, lccn, oclc, author, publisher, or id",
                        "explanation": "The CloudCite API did not receive a book title, isbn, lccn, oclc, author, publisher, or id"
                    };
                    var response = {
                        "statusCode": 422,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                }
                rp({
                    uri: url,
                    method: 'GET',
                    timeout: 4000,
                    transform: function(body) {
                        return body;
                    }
                }).then((body) => {
                    var response = {
                        "statusCode": 200,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": body,
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                }).catch(function (err) {
                    console.log("Error in RP:" + err);
                    var body = {
                        "error": "book not found",
                        "explanation": "The CloudCite API was unable to find the book you wanted to cite or failed to cite your book due to issues with the Google Books API."
                    };
                    var response = {
                        "statusCode": 404,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                });
            }
            else{
                var url = "https://www.googleapis.com/books/v1/volumes/" + request.book + "?key=" + process.env.GOOGLE;
                rp({
                    uri: url,
                    method: 'GET',
                    timeout: 4000,
                    transform: function(body) {
                        return JSON.parse(body);
                    }
                }).then((body) => {
                    var id = request.id == null ? "SET" : request.id;
                    var citation = {
                        "issued": {
                            "month": null,
                            "year": null,
                            "day": null
                        },
                        "id": id,
                        "author": [],
                        "editor": [],
                        "collection-editor": [],
                        "translator": [],
                        "edition": null,
                        "language": null,
                        "title": null,
                        "title-short": null,
                        "publisher": null,
                        "publisher-place": null,
                        "ISBN": null,
                        "number-of-pages": null,
                        "number-of-volumes": null,
                        "source": null,
                        "URL": null,
                        "dimensions": null,
                        "abstract": null,
                        "collection-title": null,
                        "container-title": null,
                        "collection-number": null,
                        "type": "book"
                    };
                    if(body != null){
                        if(body.volumeInfo != null){
                            if(body.volumeInfo.title != null && body.volumeInfo.title != ""){
                                citation.title = body.volumeInfo.title;
                            }
                            if(body.volumeInfo.publisher != null && body.volumeInfo.publisher != ""){
                                citation.publisher = body.volumeInfo.publisher;
                            }
                            if(body.volumeInfo.language != null && body.volumeInfo.language != ""){
                                citation.language = convertLang(body.volumeInfo.language);
                            }
                            if(body.volumeInfo.authors != null && body.volumeInfo.authors != ""){
                                var authors = body.volumeInfo.authors;
                                for(var i = 0; i < authors.length; i++){
                                    if(authors[i] != null){      
                                        var fullName = authors[i].split(' ');
                                        var given;
                                        var firstName = fullName[0];
                                        var middleName;
                                        var lastName;
                                        if(fullName.length >= 2){
                                            lastName = fullName[fullName.length - 1];
                                        }
                                        if(fullName.length == 3){
                                            middleName = fullName[fullName.length - 2];
                                        }
                                        if(fullName.length > 3){
                                            for(var j = 1; j > fullName.length - 2; j++){
                                                firstName = firstName + " " + fullName[j];
                                            }
                                            middleName = fullName[fullName.length - 2];
                                        }
                                        given = firstName;
                                        if (middleName != null){
                                            given = firstName + " " + middleName;
                                        }
                                        citation.author.push({given: given, family: lastName});
                                    }
                                }
                            }
                            if(body.volumeInfo.publishedDate != null && body.volumeInfo.publishedDate != null){
                                var date = body.volumeInfo.publishedDate.split("-");
                                if(date.length >= 1){
                                    citation.issued.year = date[0];
                                }
                                if(date.length >= 2){
                                    citation.issued.month = date[1];
                                }
                                if(date.length >= 3){
                                    citation.issued.day = date[2];
                                }
                            }
                            if(body.volumeInfo.description != null && body.volumeInfo.description != ""){
                                citation.abstract = body.volumeInfo.description;
                            }
                            if(body.volumeInfo.pageCount != null && body.volumeInfo.pageCount != ""){
                                citation["number-of-pages"] = body.volumeInfo.pageCount;
                            }
                            if(body.volumeInfo.industryIdentifiers != null && body.volumeInfo.industryIdentifiers != ""){
                                var ISBNs = [];
                                for(var i = 0; i < body.volumeInfo.industryIdentifiers.length; i++){
                                    if(body.volumeInfo.industryIdentifiers[i].type.includes("ISBN")){
                                        ISBNs.push(body.volumeInfo.industryIdentifiers[i].identifier)
                                    }
                                }
                                if(ISBNs.length >= 1){
                                    citation.ISBN = ISBNs[ISBNs.length - 1];
                                }
                            }
                            if(body.volumeInfo.dimensions != null && body.volumeInfo.dimensions != ""){
                                var dimensions;
                                if(body.volumeInfo.dimensions.height != null && body.volumeInfo.dimensions.height != ""){
                                    dimensions = body.volumeInfo.dimensions.height;
                                } 
                                if(body.volumeInfo.dimensions.width != null && body.volumeInfo.dimensions.width != ""){
                                    dimensions = dimensions + " x " + body.volumeInfo.dimensions.width;
                                } 
                                if(body.volumeInfo.dimensions.thickness != null && body.volumeInfo.dimensions.thickness != ""){
                                    dimensions = dimensions + " x " + body.volumeInfo.dimensions.thickness;
                                }
                                citation.dimensions = dimensions;
                            }
                        }
                    }
                    citation = JSON.stringify(citation)
                    var response = {
                        "statusCode": 200,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": citation,
                        "isBase64Encoded": false
                    };
                    callback(null, response);
                }).catch(function (err) {
                    console.log("Error in RP:" + err);
                    var body = {
                        "error": "book id error",
                        "explanation": "The CloudCite API was unable to find the book you wanted to cite or failed to cite your book due to issues with the Google Books API."
                    };
                    var response = {
                        "statusCode": 422,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                });
            }
            break;
        case 'music':
            if(request.type == null || request.type == ""){
                var body = {
                    "error": "invalid, unsupported, or missing music type"
                };
                var response = {
                    "statusCode": 422,
                    "headers": {
                        "Access-Control-Allow-Origin" : "*",
                        "Access-Control-Allow-Credentials" : true
                    },
                    "body": JSON.stringify(body),
                    "isBase64Encoded": false
                };
                return callback(null, response);
            }
            if(request.type.toLowerCase() == "song"){
                var search = (request.title == null || request.title == "");
                var details = (request.song == null || request.song == "") && (request.upc == null || request.upc == "");
                if(search && details){
                    var body = {
                        "error": "expected song title or id"
                    };
                    var response = {
                        "statusCode": 422,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                }
                if(details){ // If details are unavailable, perform search
                    var url = "https://itunes.apple.com/search?entity=song&term=";
                    if(request.title != null && request.title != ""){
                        url = url + request.title;
                    }
                    else{
                        var body = {
                            "error": "expected song title or id"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }
                    rp({
                        uri: url,
                        method: 'GET',
                        timeout: 4000,
                        transform: function(body) {
                            return body;
                        }
                    }).then((body) => {
                        var response = {
                            "statusCode": 200,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": body,
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }).catch(function (err) {
                        console.log("Error in RP:" + err);
                        var body = {
                            "error": "book not found"
                        };
                        var response = {
                            "statusCode": 404,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    });
                }
                else{
                    var url;
                    if(request.song != null && request.song != ""){
                        url = "https://itunes.apple.com/lookup?id=" + request.song;
                    }
                    else if(request.upc != null && request.upc != ""){
                        url = "https://itunes.apple.com/lookup?entity=song&id=" + request.upc;
                    }
                    rp({
                        uri: url,
                        method: 'GET',
                        timeout: 4000,
                        transform: function(body) {
                            return JSON.parse(body);
                        }
                    }).then((body) => {
                        var id = request.id == null ? "SET" : request.id;
                        var citation = {
                            "issued": {
                                "month": null,
                                "year": null,
                                "day": null
                            },
                            "id": id,
                            "author": [],
                            "composer": [],
                            "editor": [],
                            "edition": null,
                            "language": null,
                            "title": null,
                            "title-short": null,
                            "medium": null,
                            "publisher": null,
                            "publisher-place": null,
                            "source": null,
                            "URL": null,
                            "abstract": null,
                            "collection-title": null,
                            "genre": null,
                            "type": "song"
                        };
                        if(body != null){
                            if(body.resultCount != null){
                                if(body.resultCount.toString() == "0"){
                                    var body = {
                                        "error": "song not found"
                                    };
                                    var response = {
                                        "statusCode": 404,
                                        "headers": {
                                            "Access-Control-Allow-Origin" : "*",
                                            "Access-Control-Allow-Credentials" : true
                                        },
                                        "body": JSON.stringify(body),
                                        "isBase64Encoded": false
                                    };
                                    return callback(null, response);
                                }
                            }
                            if(body.results[0] !=  null){
                                if(body.results[0].releaseDate != null && body.results[0].releaseDate != ""){
                                    var date = new Date(body.results[0].releaseDate)
                                    citation.issued.month = (date.getMonth() + 1).toString();
                                    citation.issued.day = date.getDate().toString();
                                    citation.issued.year = date.getFullYear().toString();
                                }
                                if(body.results[0].trackName != null && body.results[0].trackName != ""){
                                    citation.title = body.results[0].trackName;
                                }
                                if(body.results[0].primaryGenreName != null && body.results[0].primaryGenreName != ""){
                                    citation.genre = body.results[0].primaryGenreName;
                                }
                                if(body.results[0].collectionName != null && body.results[0].collectionName != ""){
                                    citation["collection-title"] = body.results[0].collectionName;
                                }
                                if(body.results[0].artistName != null && body.results[0].artistName != ""){
                                    var authors = splitMulti(body.results[0].artistName, [' and ', ', ', ' & '])
                                    for(var i = 0; i < authors.length; i++){
                                        if(authors[i] != null){      
                                            var fullName = authors[i].split(' ');
                                            var given;
                                            var firstName = fullName[0];
                                            var middleName;
                                            var lastName;
                                            if(fullName.length >= 2){
                                                lastName = fullName[fullName.length - 1];
                                            }
                                            if(fullName.length == 3){
                                                middleName = fullName[fullName.length - 2];
                                            }
                                            if(fullName.length > 3){
                                                for(var j = 1; j > fullName.length - 2; j++){
                                                    firstName = firstName + " " + fullName[j];
                                                }
                                                middleName = fullName[fullName.length - 2];
                                            }
                                            given = firstName;
                                            if (middleName != null){
                                                given = firstName + " " + middleName;
                                            }
                                            citation.author.push({given: given, family: lastName});
                                        }
                                    }
                                }
                            }
                        }
                        citation = JSON.stringify(citation)
                        var response = {
                            "statusCode": 200,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": citation,
                            "isBase64Encoded": false
                        };
                        callback(null, response);
                    }).catch(function (err) {
                        console.log("Error in RP:" + err);
                        var body = {
                            "error": "song id error"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    });
                }
            }
            else if(request.type.toLowerCase() == "album"){
                var search = (request.title == null || request.title == "");
                var details = (request.album == null || request.album == "") && (request.upc == null || request.upc == "");
                if(search && details){
                    var body = {
                        "error": "expected album title or id"
                    };
                    var response = {
                        "statusCode": 422,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                }
                if(details){ // If details are unavailable, perform search
                    var url = "https://itunes.apple.com/search?entity=album&term=";
                    if(request.title != null && request.title != ""){
                        url = url + request.title;
                    }
                    else{
                        var body = {
                            "error": "expected album title or id"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }
                    rp({
                        uri: url,
                        method: 'GET',
                        timeout: 4000,
                        transform: function(body) {
                            return body;
                        }
                    }).then((body) => {
                        var response = {
                            "statusCode": 200,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": body,
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }).catch(function (err) {
                        console.log("Error in RP:" + err);
                        var body = {
                            "error": "book not found"
                        };
                        var response = {
                            "statusCode": 404,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    });
                }
                else{
                    var url;
                    if(request.album != null && request.album != ""){
                        url = "https://itunes.apple.com/lookup?id=" + request.album;
                    }
                    else if(request.upc != null && request.upc != ""){
                        url = "https://itunes.apple.com/lookup?id=" + request.upc;
                    }
                    rp({
                        uri: url,
                        method: 'GET',
                        timeout: 4000,
                        transform: function(body) {
                            return JSON.parse(body);
                        }
                    }).then((body) => {
                        var id = request.id == null ? "SET" : request.id;
                        var citation = {
                            "issued": {
                                "month": null,
                                "year": null,
                                "day": null
                            },
                            "id": id,
                            "author": [],
                            "composer": [],
                            "editor": [],
                            "edition": null,
                            "language": null,
                            "title": null,
                            "title-short": null,
                            "medium": null,
                            "publisher": null,
                            "publisher-place": null,
                            "source": null,
                            "URL": null,
                            "abstract": null,
                            "collection-title": null,
                            "genre": null,
                            "type": "song"
                        };
                        if(body != null){
                            if(body.resultCount != null){
                                if(body.resultCount.toString() == "0"){
                                    var body = {
                                        "error": "song not found"
                                    };
                                    var response = {
                                        "statusCode": 404,
                                        "headers": {
                                            "Access-Control-Allow-Origin" : "*",
                                            "Access-Control-Allow-Credentials" : true
                                        },
                                        "body": JSON.stringify(body),
                                        "isBase64Encoded": false
                                    };
                                    return callback(null, response);
                                }
                            }
                            if(body.results[0] !=  null){
                                if(body.results[0].releaseDate != null && body.results[0].releaseDate != ""){
                                    var date = new Date(body.results[0].releaseDate)
                                    citation.issued.month = (date.getMonth() + 1).toString();
                                    citation.issued.day = date.getDate().toString();
                                    citation.issued.year = date.getFullYear().toString();
                                }
                                if(body.results[0].primaryGenreName != null && body.results[0].primaryGenreName != ""){
                                    citation.genre = body.results[0].primaryGenreName;
                                }
                                if(body.results[0].collectionName != null && body.results[0].collectionName != ""){
                                    citation["collection-title"] = body.results[0].collectionName;
                                }
                                if(body.results[0].copyright != null && body.results[0].copyright != ""){
                                    citation.publisher = sanitizeInput(body.results[0].copyright.replace(/[0-9][0-9][0-9][0-9]/g, '')).trim();
                                }
                                if(body.results[0].artistName != null && body.results[0].artistName != ""){
                                    var authors = splitMulti(body.results[0].artistName, [' and ', ', ', ' & '])
                                    for(var i = 0; i < authors.length; i++){
                                        if(authors[i] != null){      
                                            var fullName = authors[i].split(' ');
                                            var given;
                                            var firstName = fullName[0];
                                            var middleName;
                                            var lastName;
                                            if(fullName.length >= 2){
                                                lastName = fullName[fullName.length - 1];
                                            }
                                            if(fullName.length == 3){
                                                middleName = fullName[fullName.length - 2];
                                            }
                                            if(fullName.length > 3){
                                                for(var j = 1; j > fullName.length - 2; j++){
                                                    firstName = firstName + " " + fullName[j];
                                                }
                                                middleName = fullName[fullName.length - 2];
                                            }
                                            given = firstName;
                                            if (middleName != null){
                                                given = firstName + " " + middleName;
                                            }
                                            citation.author.push({given: given, family: lastName});
                                        }
                                    }
                                }
                            }
                        }
                        citation = JSON.stringify(citation)
                        var response = {
                            "statusCode": 200,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": citation,
                            "isBase64Encoded": false
                        };
                        callback(null, response);
                    }).catch(function (err) {
                        console.log("Error in RP:" + err);
                        var body = {
                            "error": "song id error"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    });
                }    
            }
            else if(request.type.toLowerCase() == "song-in-album"){
                var search = (request.album == null || request.album == "") && (request.upc == null || request.upc == "");
                var details = (request.number == null || request.number == "");
                if(search && details){
                    var body = {
                        "error": "expected album id or upc"
                    };
                    var response = {
                        "statusCode": 422,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                }
                if(details){ // If details are unavailable, perform search
                    var url = "https://itunes.apple.com/search?entity=album&term=";
                    if(request.album != null && request.album != ""){
                        url = "https://itunes.apple.com/lookup?entity=song&id=" + request.album;
                    }
                    else if(request.upc != null && request.upc != ""){
                        url = "https://itunes.apple.com/lookup?entity=song&id=" + request.upc;
                    }
                    else{
                        var body = {
                            "error": "expected album id or upc"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }
                    rp({
                        uri: url,
                        method: 'GET',
                        timeout: 4000,
                        transform: function(body) {
                            return body;
                        }
                    }).then((body) => {
                        var response = {
                            "statusCode": 200,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": body,
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }).catch(function (err) {
                        console.log("Error in RP:" + err);
                        var body = {
                            "error": "book not found"
                        };
                        var response = {
                            "statusCode": 404,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    });
                }
                else{
                    var url;
                    var number = parseInt("" + request.number, 10)
                    if(request.album != null && request.album != ""){
                        url = "https://itunes.apple.com/lookup?entity=song&id=" + request.album;
                    }
                    else if(request.upc != null && request.upc != ""){
                        url = "https://itunes.apple.com/lookup?entity=song&id=" + request.upc;
                    }
                    else{
                        var body = {
                            "error": "must provide album id or upc along with song number"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }
                    rp({
                        uri: url,
                        method: 'GET',
                        timeout: 4000,
                        transform: function(body) {
                            return JSON.parse(body);
                        }
                    }).then((body) => {
                        var id = request.id == null ? "SET" : request.id;
                        var citation = {
                            "issued": {
                                "month": null,
                                "year": null,
                                "day": null
                            },
                            "id": id,
                            "author": [],
                            "composer": [],
                            "editor": [],
                            "edition": null,
                            "language": null,
                            "title": null,
                            "title-short": null,
                            "medium": null,
                            "publisher": null,
                            "publisher-place": null,
                            "source": null,
                            "URL": null,
                            "abstract": null,
                            "collection-title": null,
                            "genre": null,
                            "type": "song"
                        };
                        if(body != null){
                            if(body.resultCount != null){
                                if(body.resultCount.toString() == "0"){
                                    var body = {
                                        "error": "song not found"
                                    };
                                    var response = {
                                        "statusCode": 404,
                                        "headers": {
                                            "Access-Control-Allow-Origin" : "*",
                                            "Access-Control-Allow-Credentials" : true
                                        },
                                        "body": JSON.stringify(body),
                                        "isBase64Encoded": false
                                    };
                                    return callback(null, response);
                                }
                            }
                            if(body.results[0] !=  null){
                                if(body.results[number].releaseDate != null && body.results[number].releaseDate != ""){
                                    var date = new Date(body.results[number].releaseDate)
                                    citation.issued.month = (date.getMonth() + 1).toString();
                                    citation.issued.day = date.getDate().toString();
                                    citation.issued.year = date.getFullYear().toString();
                                }
                                if(body.results[number].trackName != null && body.results[number].trackName != ""){
                                    citation.title = body.results[number].trackName;
                                }
                                if(body.results[number].primaryGenreName != null && body.results[number].primaryGenreName != ""){
                                    citation.genre = body.results[number].primaryGenreName;
                                }
                                if(body.results[0].collectionName != null && body.results[0].collectionName != ""){
                                    citation["collection-title"] = body.results[0].collectionName;
                                }
                                if(body.results[0].copyright != null && body.results[0].copyright != ""){
                                    citation.publisher = sanitizeInput(body.results[0].copyright.replace(/[0-9][0-9][0-9][0-9]/g, '')).trim();
                                }
                                if(body.results[number].artistName != null && body.results[number].artistName != ""){
                                    var authors = splitMulti(body.results[number].artistName, [' and ', ', ', ' & '])
                                    for(var i = 0; i < authors.length; i++){
                                        if(authors[i] != null){      
                                            var fullName = authors[i].split(' ');
                                            var given;
                                            var firstName = fullName[0];
                                            var middleName;
                                            var lastName;
                                            if(fullName.length >= 2){
                                                lastName = fullName[fullName.length - 1];
                                            }
                                            if(fullName.length == 3){
                                                middleName = fullName[fullName.length - 2];
                                            }
                                            if(fullName.length > 3){
                                                for(var j = 1; j > fullName.length - 2; j++){
                                                    firstName = firstName + " " + fullName[j];
                                                }
                                                middleName = fullName[fullName.length - 2];
                                            }
                                            given = firstName;
                                            if (middleName != null){
                                                given = firstName + " " + middleName;
                                            }
                                            citation.author.push({given: given, family: lastName});
                                        }
                                    }
                                }
                            }
                        }
                        citation = JSON.stringify(citation)
                        var response = {
                            "statusCode": 200,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": citation,
                            "isBase64Encoded": false
                        };
                        callback(null, response);
                    }).catch(function (err) {
                        console.log("Error in RP:" + err);
                        var body = {
                            "error": "song id error"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    });
                }    
            }
            else{
                var body = {
                    "error": "invalid, unsupported, or missing music type"
                };
                var response = {
                    "statusCode": 422,
                    "headers": {
                        "Access-Control-Allow-Origin" : "*",
                        "Access-Control-Allow-Credentials" : true
                    },
                    "body": JSON.stringify(body),
                    "isBase64Encoded": false
                };
                return callback(null, response);
            }
            break;  
        case 'podcast':
            if(request.type == null || request.type == ""){
                var body = {
                    "error": "invalid, unsupported, or missing podcast type"
                };
                var response = {
                    "statusCode": 422,
                    "headers": {
                        "Access-Control-Allow-Origin" : "*",
                        "Access-Control-Allow-Credentials" : true
                    },
                    "body": JSON.stringify(body),
                    "isBase64Encoded": false
                };
                return callback(null, response);
            }
            if(request.type.toLowerCase() == "podcast"){
                var search = (request.title == null || request.title == "");
                var details = (request.podcast == null || request.podcast == "");
                if(search && details){
                    var body = {
                        "error": "expected podcast title or id"
                    };
                    var response = {
                        "statusCode": 422,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                }
                if(details){ // If details are unavailable, perform search
                    var url = "https://itunes.apple.com/search?entity=podcast&term=";
                    if(request.title != null && request.title != ""){
                        url = url + request.title;
                    }
                    else{
                        var body = {
                            "error": "expected podcast title or id"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }
                    rp({
                        uri: url,
                        method: 'GET',
                        timeout: 4000,
                        transform: function(body) {
                            return body;
                        }
                    }).then((body) => {
                        var response = {
                            "statusCode": 200,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": body,
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }).catch(function (err) {
                        console.log("Error in RP:" + err);
                        var body = {
                            "error": "podcast not found"
                        };
                        var response = {
                            "statusCode": 404,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    });
                }
                else{
                    var url;
                    if(request.podcast != null && request.podcast != ""){
                        url = "https://itunes.apple.com/lookup?id=" + request.podcast;
                    }
                    rp({
                        uri: url,
                        method: 'GET',
                        timeout: 4000,
                        transform: function(body) {
                            return JSON.parse(body);
                        }
                    }).then((body) => {
                        var id = request.id == null ? "SET" : request.id;
                        var citation = {
                            "issued": {
                                "month": null,
                                "year": null,
                                "day": null
                            },
                            "id": id,
                            "author": [],
                            "composer": [],
                            "editor": [],
                            "edition": null,
                            "language": null,
                            "title": null,
                            "title-short": null,
                            "medium": null,
                            "publisher": null,
                            "publisher-place": null,
                            "source": null,
                            "URL": null,
                            "abstract": null,
                            "collection-title": null,
                            "genre": null,
                            "type": "song"
                        };
                        if(body != null){
                            if(body.resultCount != null){
                                if(body.resultCount.toString() == "0"){
                                    var body = {
                                        "error": "podcast not found"
                                    };
                                    var response = {
                                        "statusCode": 404,
                                        "headers": {
                                            "Access-Control-Allow-Origin" : "*",
                                            "Access-Control-Allow-Credentials" : true
                                        },
                                        "body": JSON.stringify(body),
                                        "isBase64Encoded": false
                                    };
                                    return callback(null, response);
                                }
                            }
                            if(body.results[0] !=  null){
                                if(body.results[0].releaseDate != null && body.results[0].releaseDate != ""){
                                    var date = new Date(body.results[0].releaseDate)
                                    citation.issued.month = (date.getMonth() + 1).toString();
                                    citation.issued.day = date.getDate().toString();
                                    citation.issued.year = date.getFullYear().toString();
                                }
                                if(body.results[0].trackName != null && body.results[0].trackName != ""){
                                    citation.title = body.results[0].trackName;
                                }
                                if(body.results[0].primaryGenreName != null && body.results[0].primaryGenreName != ""){
                                    citation.genre = body.results[0].primaryGenreName;
                                }
                                if(body.results[0].collectionName != null && body.results[0].collectionName != ""){
                                    citation["collection-title"] = body.results[0].collectionName;
                                }
                                if(body.results[0].artistName != null && body.results[0].artistName != ""){
                                    var authors = splitMulti(body.results[0].artistName, [' and ', ', ', ' & '])
                                    for(var i = 0; i < authors.length; i++){
                                        if(authors[i] != null){      
                                            var fullName = authors[i].split(' ');
                                            var given;
                                            var firstName = fullName[0];
                                            var middleName;
                                            var lastName;
                                            if(fullName.length >= 2){
                                                lastName = fullName[fullName.length - 1];
                                            }
                                            if(fullName.length == 3){
                                                middleName = fullName[fullName.length - 2];
                                            }
                                            if(fullName.length > 3){
                                                for(var j = 1; j > fullName.length - 2; j++){
                                                    firstName = firstName + " " + fullName[j];
                                                }
                                                middleName = fullName[fullName.length - 2];
                                            }
                                            given = firstName;
                                            if (middleName != null){
                                                given = firstName + " " + middleName;
                                            }
                                            citation.author.push({given: given, family: lastName});
                                        }
                                    }
                                }
                            }
                        }
                        citation = JSON.stringify(citation)
                        var response = {
                            "statusCode": 200,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": citation,
                            "isBase64Encoded": false
                        };
                        callback(null, response);
                    }).catch(function (err) {
                        console.log("Error in RP:" + err);
                        var body = {
                            "error": "song id error"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    });
                }
            }
            else if(request.type.toLowerCase() == "episode"){
                var search = (request.title == null || request.title == "");
                var details = (request.podcast == null || request.podcast == "");
                if(search && details){
                    var body = {
                        "error": "expected podcast title or id"
                    };
                    var response = {
                        "statusCode": 422,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(body),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                }
                if(details){ // If details are unavailable, perform search
                    var url = "https://itunes.apple.com/search?entity=podcast&term=";
                    if(request.title != null && request.title != ""){
                        url = url + request.title;
                    }
                    else{
                        var body = {
                            "error": "expected podcast title or id"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }
                    rp({
                        uri: url,
                        method: 'GET',
                        timeout: 4000,
                        transform: function(body) {
                            return body;
                        }
                    }).then((body) => {
                        var response = {
                            "statusCode": 200,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": body,
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    }).catch(function (err) {
                        console.log("Error in RP:" + err);
                        var body = {
                            "error": "podcast not found"
                        };
                        var response = {
                            "statusCode": 404,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    });
                }
                else{
                    var url;
                    if(request.podcast != null && request.podcast != ""){
                        url = "https://itunes.apple.com/lookup?id=" + request.podcast;
                    }
                    rp({
                        uri: url,
                        method: 'GET',
                        timeout: 4000,
                        transform: function(body) {
                            return JSON.parse(body);
                        }
                    }).then((body) => {
                        var id = request.id == null ? "SET" : request.id;
                        var citation = {
                            "issued": {
                                "month": null,
                                "year": null,
                                "day": null
                            },
                            "id": id,
                            "author": [],
                            "composer": [],
                            "editor": [],
                            "edition": null,
                            "language": null,
                            "title": null,
                            "title-short": null,
                            "medium": null,
                            "publisher": null,
                            "publisher-place": null,
                            "source": null,
                            "URL": null,
                            "abstract": null,
                            "collection-title": null,
                            "genre": null,
                            "type": "song"
                        };
                        if(body != null){
                            if(body.resultCount != null){
                                if(body.resultCount.toString() == "0"){
                                    var body = {
                                        "error": "podcast not found"
                                    };
                                    var response = {
                                        "statusCode": 404,
                                        "headers": {
                                            "Access-Control-Allow-Origin" : "*",
                                            "Access-Control-Allow-Credentials" : true
                                        },
                                        "body": JSON.stringify(body),
                                        "isBase64Encoded": false
                                    };
                                    return callback(null, response);
                                }
                            }
                            if(body.results[0] !=  null){
                                if(body.results[0].releaseDate != null && body.results[0].releaseDate != ""){
                                    var date = new Date(body.results[0].releaseDate)
                                    citation.issued.month = (date.getMonth() + 1).toString();
                                    citation.issued.day = date.getDate().toString();
                                    citation.issued.year = date.getFullYear().toString();
                                }
                                if(body.results[0].primaryGenreName != null && body.results[0].primaryGenreName != ""){
                                    citation.genre = body.results[0].primaryGenreName;
                                }
                                if(body.results[0].primaryGenreName != null && body.results[0].primaryGenreName != ""){
                                    citation.genre = body.results[0].primaryGenreName;
                                }
                                if(body.results[0].feedUrl != null && body.results[0].feedUrl != ""){
                                    url = body.results[0].feedUrl; // Podcast Episode Data (XML); iTunes Only Provides Podcast Data
                                    rp({
                                        uri: url,
                                        method: 'GET',
                                        timeout: 4000,
                                        transform: function(body) {
                                            return body;
                                        }
                                    }).then((body) => {
                                        // XML to JSON
                                    }).catch(function (err) {
                                        console.log("Error in RP:" + err);
                                        var body = {
                                            "error": "podcast episode error"
                                        };
                                        var response = {
                                            "statusCode": 422,
                                            "headers": {
                                                "Access-Control-Allow-Origin" : "*",
                                                "Access-Control-Allow-Credentials" : true
                                            },
                                            "body": JSON.stringify(body),
                                            "isBase64Encoded": false
                                        };
                                        return callback(null, response);
                                    });
                                }
                                if(body.results[0].copyright != null && body.results[0].copyright != ""){
                                    citation.publisher = sanitizeInput(body.results[0].copyright.replace(/[0-9][0-9][0-9][0-9]/g, '')).trim();
                                }
                                if(body.results[0].artistName != null && body.results[0].artistName != ""){
                                    var authors = splitMulti(body.results[0].artistName, [' and ', ', ', ' & '])
                                    for(var i = 0; i < authors.length; i++){
                                        if(authors[i] != null){      
                                            var fullName = authors[i].split(' ');
                                            var given;
                                            var firstName = fullName[0];
                                            var middleName;
                                            var lastName;
                                            if(fullName.length >= 2){
                                                lastName = fullName[fullName.length - 1];
                                            }
                                            if(fullName.length == 3){
                                                middleName = fullName[fullName.length - 2];
                                            }
                                            if(fullName.length > 3){
                                                for(var j = 1; j > fullName.length - 2; j++){
                                                    firstName = firstName + " " + fullName[j];
                                                }
                                                middleName = fullName[fullName.length - 2];
                                            }
                                            given = firstName;
                                            if (middleName != null){
                                                given = firstName + " " + middleName;
                                            }
                                            citation.author.push({given: given, family: lastName});
                                        }
                                    }
                                }
                            }
                        }
                        citation = JSON.stringify(citation)
                        var response = {
                            "statusCode": 200,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": citation,
                            "isBase64Encoded": false
                        };
                        callback(null, response);
                    }).catch(function (err) {
                        console.log("Error in RP:" + err);
                        var body = {
                            "error": "podcast id error"
                        };
                        var response = {
                            "statusCode": 422,
                            "headers": {
                                "Access-Control-Allow-Origin" : "*",
                                "Access-Control-Allow-Credentials" : true
                            },
                            "body": JSON.stringify(body),
                            "isBase64Encoded": false
                        };
                        return callback(null, response);
                    });
                }    
            }
            else{
                var body = {
                    "error": "invalid, unsupported, or missing music type"
                };
                var response = {
                    "statusCode": 422,
                    "headers": {
                        "Access-Control-Allow-Origin" : "*",
                        "Access-Control-Allow-Credentials" : true
                    },
                    "body": JSON.stringify(body),
                    "isBase64Encoded": false
                };
                return callback(null, response);
            }
            break;
        case 'journal': 
            break; 
        case 'tv': 
            break;   
        case 'image': 
            break;                   
        default:
            //console.log('Format is invalid');
            //console.log("request: " + JSON.stringify(event));
            var body = {
                "error": "bad request"
            };
            var response = {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin" : "*",
                    "Access-Control-Allow-Credentials" : true
                },
                "body": JSON.stringify(body),
                "isBase64Encoded": false
            };
            return callback(null, response);
    }
}

function sanitizeInput(s) {
    s = s.replace('©', '');
    s = s.replace('℗', '');
    s = s.replace('Copyright', '');
    s = s.replace('copyright', '');
    s = s.replace('-', '');
    s = s.replaceAll('&nbsp;', ' ');
    s = s.replaceAll('\xa0',' ');
    s = s.replaceAll('All Rights Reserved', '');
    s = s.replace(' or its affiliated companies', '');
    s = s.replace('&lt;', '');
    s = s.replace('&gt;', '');
    s = s.replace('&#60;', '');
    s = s.replace('&#62;', '');
    s = s.replace('&#34;', '');
    s = s.replace('&quot;', '');
    s = s.replace('&quot', '');
    s = s.replace('&apos;', '');
    s = s.replace('&apos', '');     
    s = s.replace('&#39;', '');
    s = s.replace('&#162;', '');
    s = s.replace('&#169;', '');
    s = s.replace('&copy;', '');
    s = s.replace('&reg;', '');
    s = s.replace('&#174;', '');
    s = s.replace(/-+/g,'-'); //Removes consecutive dashes
    s = s.replace(/ +(?= )/g,''); //Removes double spacing
  
    return s;
}
  
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

function splitMulti(str, tokens){
    var tempChar = tokens[0]; // We can use the first token as a temporary join character
    for(var i = 1; i < tokens.length; i++){
        str = str.split(tokens[i]).join(tempChar);
    }
    str = str.split(tempChar);
    return str;
}

function ConvertKeysToLowerCase(obj) {
    var output = {};
    for (i in obj) {
        if (Object.prototype.toString.apply(obj[i]) === '[object Object]') {
        output[i.toLowerCase()] = ConvertKeysToLowerCase(obj[i]);
        }else if(Object.prototype.toString.apply(obj[i]) === '[object Array]'){
            output[i.toLowerCase()]=[];
            output[i.toLowerCase()].push(ConvertKeysToLowerCase(obj[i][0]));
        } else {
            output[i.toLowerCase()] = obj[i];
        }
    }
    return output;
};

function extractHostname(url) {
    var hostname;
    //find & remove protocol (http, ftp, etc.) and get hostname
    if (url.indexOf("://") > -1) {
        hostname = url.split('/')[2];
    }
    else {
        hostname = url.split('/')[0];
    }
    //find & remove port number
    hostname = hostname.split(':')[0];
    //find & remove "?"
    hostname = hostname.split('?')[0];
    return hostname;
};

function extractRootDomain(url) {
    var domain = extractHostname(url);
    splitArr = domain.split('.'),
    arrLen = splitArr.length;
    if (arrLen > 2) {
        domain = splitArr[arrLen - 2] + '.' + splitArr[arrLen - 1];
        if (splitArr[arrLen - 1].length == 2 && splitArr[arrLen - 1].length == 2) {
            domain = splitArr[arrLen - 3] + '.' + domain;
        }
    }
    return domain;
};

function youtubeID(url){
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match&&match[7].length==11)? match[7] : false;
}

function convertLang(lang){
    var isoLangs = {
        ab: {
          name: 'Abkhaz',
          nativeName: 'аҧсуа'
        },
        aa: {
          name: 'Afar',
          nativeName: 'Afaraf'
        },
        af: {
          name: 'Afrikaans',
          nativeName: 'Afrikaans'
        },
        ak: {
          name: 'Akan',
          nativeName: 'Akan'
        },
        sq: {
          name: 'Albanian',
          nativeName: 'Shqip'
        },
        am: {
          name: 'Amharic',
          nativeName: 'አማርኛ'
        },
        ar: {
          name: 'Arabic',
          nativeName: 'العربية'
        },
        an: {
          name: 'Aragonese',
          nativeName: 'Aragonés'
        },
        hy: {
          name: 'Armenian',
          nativeName: 'Հայերեն'
        },
        as: {
          name: 'Assamese',
          nativeName: 'অসমীয়া'
        },
        av: {
          name: 'Avaric',
          nativeName: 'авар мацӀ, магӀарул мацӀ'
        },
        ae: {
          name: 'Avestan',
          nativeName: 'avesta'
        },
        ay: {
          name: 'Aymara',
          nativeName: 'aymar aru'
        },
        az: {
          name: 'Azerbaijani',
          nativeName: 'azərbaycan dili'
        },
        bm: {
          name: 'Bambara',
          nativeName: 'bamanankan'
        },
        ba: {
          name: 'Bashkir',
          nativeName: 'башҡорт теле'
        },
        eu: {
          name: 'Basque',
          nativeName: 'euskara, euskera'
        },
        be: {
          name: 'Belarusian',
          nativeName: 'Беларуская'
        },
        bn: {
          name: 'Bengali',
          nativeName: 'বাংলা'
        },
        bh: {
          name: 'Bihari',
          nativeName: 'भोजपुरी'
        },
        bi: {
          name: 'Bislama',
          nativeName: 'Bislama'
        },
        bs: {
          name: 'Bosnian',
          nativeName: 'bosanski jezik'
        },
        br: {
          name: 'Breton',
          nativeName: 'brezhoneg'
        },
        bg: {
          name: 'Bulgarian',
          nativeName: 'български език'
        },
        my: {
          name: 'Burmese',
          nativeName: 'ဗမာစာ'
        },
        ca: {
          name: 'Catalan; Valencian',
          nativeName: 'Català'
        },
        ch: {
          name: 'Chamorro',
          nativeName: 'Chamoru'
        },
        ce: {
          name: 'Chechen',
          nativeName: 'нохчийн мотт'
        },
        ny: {
          name: 'Chichewa; Chewa; Nyanja',
          nativeName: 'chiCheŵa, chinyanja'
        },
        zh: {
          name: 'Chinese',
          nativeName: '中文 (Zhōngwén), 汉语, 漢語'
        },
        cv: {
          name: 'Chuvash',
          nativeName: 'чӑваш чӗлхи'
        },
        kw: {
          name: 'Cornish',
          nativeName: 'Kernewek'
        },
        co: {
          name: 'Corsican',
          nativeName: 'corsu, lingua corsa'
        },
        cr: {
          name: 'Cree',
          nativeName: 'ᓀᐦᐃᔭᐍᐏᐣ'
        },
        hr: {
          name: 'Croatian',
          nativeName: 'hrvatski'
        },
        cs: {
          name: 'Czech',
          nativeName: 'česky, čeština'
        },
        da: {
          name: 'Danish',
          nativeName: 'dansk'
        },
        dv: {
          name: 'Divehi; Dhivehi; Maldivian;',
          nativeName: 'ދިވެހި'
        },
        nl: {
          name: 'Dutch',
          nativeName: 'Nederlands, Vlaams'
        },
        en: {
          name: 'English',
          nativeName: 'English'
        },
        eo: {
          name: 'Esperanto',
          nativeName: 'Esperanto'
        },
        et: {
          name: 'Estonian',
          nativeName: 'eesti, eesti keel'
        },
        ee: {
          name: 'Ewe',
          nativeName: 'Eʋegbe'
        },
        fo: {
          name: 'Faroese',
          nativeName: 'føroyskt'
        },
        fj: {
          name: 'Fijian',
          nativeName: 'vosa Vakaviti'
        },
        fi: {
          name: 'Finnish',
          nativeName: 'suomi, suomen kieli'
        },
        fr: {
          name: 'French',
          nativeName: 'français, langue française'
        },
        ff: {
          name: 'Fula; Fulah; Pulaar; Pular',
          nativeName: 'Fulfulde, Pulaar, Pular'
        },
        gl: {
          name: 'Galician',
          nativeName: 'Galego'
        },
        ka: {
          name: 'Georgian',
          nativeName: 'ქართული'
        },
        de: {
          name: 'German',
          nativeName: 'Deutsch'
        },
        el: {
          name: 'Greek, Modern',
          nativeName: 'Ελληνικά'
        },
        gn: {
          name: 'Guaraní',
          nativeName: 'Avañeẽ'
        },
        gu: {
          name: 'Gujarati',
          nativeName: 'ગુજરાતી'
        },
        ht: {
          name: 'Haitian; Haitian Creole',
          nativeName: 'Kreyòl ayisyen'
        },
        ha: {
          name: 'Hausa',
          nativeName: 'Hausa, هَوُسَ'
        },
        he: {
          name: 'Hebrew (modern)',
          nativeName: 'עברית'
        },
        hz: {
          name: 'Herero',
          nativeName: 'Otjiherero'
        },
        hi: {
          name: 'Hindi',
          nativeName: 'हिन्दी, हिंदी'
        },
        ho: {
          name: 'Hiri Motu',
          nativeName: 'Hiri Motu'
        },
        hu: {
          name: 'Hungarian',
          nativeName: 'Magyar'
        },
        ia: {
          name: 'Interlingua',
          nativeName: 'Interlingua'
        },
        id: {
          name: 'Indonesian',
          nativeName: 'Bahasa Indonesia'
        },
        ie: {
          name: 'Interlingue',
          nativeName: 'Originally called Occidental; then Interlingue after WWII'
        },
        ga: {
          name: 'Irish',
          nativeName: 'Gaeilge'
        },
        ig: {
          name: 'Igbo',
          nativeName: 'Asụsụ Igbo'
        },
        ik: {
          name: 'Inupiaq',
          nativeName: 'Iñupiaq, Iñupiatun'
        },
        io: {
          name: 'Ido',
          nativeName: 'Ido'
        },
        is: {
          name: 'Icelandic',
          nativeName: 'Íslenska'
        },
        it: {
          name: 'Italian',
          nativeName: 'Italiano'
        },
        iu: {
          name: 'Inuktitut',
          nativeName: 'ᐃᓄᒃᑎᑐᑦ'
        },
        ja: {
          name: 'Japanese',
          nativeName: '日本語 (にほんご／にっぽんご)'
        },
        jv: {
          name: 'Javanese',
          nativeName: 'basa Jawa'
        },
        kl: {
          name: 'Kalaallisut, Greenlandic',
          nativeName: 'kalaallisut, kalaallit oqaasii'
        },
        kn: {
          name: 'Kannada',
          nativeName: 'ಕನ್ನಡ'
        },
        kr: {
          name: 'Kanuri',
          nativeName: 'Kanuri'
        },
        ks: {
          name: 'Kashmiri',
          nativeName: 'कश्मीरी, كشميري\u200e'
        },
        kk: {
          name: 'Kazakh',
          nativeName: 'Қазақ тілі'
        },
        km: {
          name: 'Khmer',
          nativeName: 'ភាសាខ្មែរ'
        },
        ki: {
          name: 'Kikuyu, Gikuyu',
          nativeName: 'Gĩkũyũ'
        },
        rw: {
          name: 'Kinyarwanda',
          nativeName: 'Ikinyarwanda'
        },
        ky: {
          name: 'Kirghiz, Kyrgyz',
          nativeName: 'кыргыз тили'
        },
        kv: {
          name: 'Komi',
          nativeName: 'коми кыв'
        },
        kg: {
          name: 'Kongo',
          nativeName: 'KiKongo'
        },
        ko: {
          name: 'Korean',
          nativeName: '한국어 (韓國語), 조선말 (朝鮮語)'
        },
        ku: {
          name: 'Kurdish',
          nativeName: 'Kurdî, كوردی\u200e'
        },
        kj: {
          name: 'Kwanyama, Kuanyama',
          nativeName: 'Kuanyama'
        },
        la: {
          name: 'Latin',
          nativeName: 'latine, lingua latina'
        },
        lb: {
          name: 'Luxembourgish, Letzeburgesch',
          nativeName: 'Lëtzebuergesch'
        },
        lg: {
          name: 'Luganda',
          nativeName: 'Luganda'
        },
        li: {
          name: 'Limburgish, Limburgan, Limburger',
          nativeName: 'Limburgs'
        },
        ln: {
          name: 'Lingala',
          nativeName: 'Lingála'
        },
        lo: {
          name: 'Lao',
          nativeName: 'ພາສາລາວ'
        },
        lt: {
          name: 'Lithuanian',
          nativeName: 'lietuvių kalba'
        },
        lu: {
          name: 'Luba-Katanga',
          nativeName: ''
        },
        lv: {
          name: 'Latvian',
          nativeName: 'latviešu valoda'
        },
        gv: {
          name: 'Manx',
          nativeName: 'Gaelg, Gailck'
        },
        mk: {
          name: 'Macedonian',
          nativeName: 'македонски јазик'
        },
        mg: {
          name: 'Malagasy',
          nativeName: 'Malagasy fiteny'
        },
        ms: {
          name: 'Malay',
          nativeName: 'bahasa Melayu, بهاس ملايو\u200e'
        },
        ml: {
          name: 'Malayalam',
          nativeName: 'മലയാളം'
        },
        mt: {
          name: 'Maltese',
          nativeName: 'Malti'
        },
        mi: {
          name: 'Māori',
          nativeName: 'te reo Māori'
        },
        mr: {
          name: 'Marathi (Marāṭhī)',
          nativeName: 'मराठी'
        },
        mh: {
          name: 'Marshallese',
          nativeName: 'Kajin M̧ajeļ'
        },
        mn: {
          name: 'Mongolian',
          nativeName: 'монгол'
        },
        na: {
          name: 'Nauru',
          nativeName: 'Ekakairũ Naoero'
        },
        nv: {
          name: 'Navajo, Navaho',
          nativeName: 'Diné bizaad, Dinékʼehǰí'
        },
        nb: {
          name: 'Norwegian Bokmål',
          nativeName: 'Norsk bokmål'
        },
        nd: {
          name: 'North Ndebele',
          nativeName: 'isiNdebele'
        },
        ne: {
          name: 'Nepali',
          nativeName: 'नेपाली'
        },
        ng: {
          name: 'Ndonga',
          nativeName: 'Owambo'
        },
        nn: {
          name: 'Norwegian Nynorsk',
          nativeName: 'Norsk nynorsk'
        },
        no: {
          name: 'Norwegian',
          nativeName: 'Norsk'
        },
        ii: {
          name: 'Nuosu',
          nativeName: 'ꆈꌠ꒿ Nuosuhxop'
        },
        nr: {
          name: 'South Ndebele',
          nativeName: 'isiNdebele'
        },
        oc: {
          name: 'Occitan',
          nativeName: 'Occitan'
        },
        oj: {
          name: 'Ojibwe, Ojibwa',
          nativeName: 'ᐊᓂᔑᓈᐯᒧᐎᓐ'
        },
        cu: {
          name: 'Old Church Slavonic, Church Slavic, Church Slavonic, Old Bulgarian, Old Slavonic',
          nativeName: 'ѩзыкъ словѣньскъ'
        },
        om: {
          name: 'Oromo',
          nativeName: 'Afaan Oromoo'
        },
        or: {
          name: 'Oriya',
          nativeName: 'ଓଡ଼ିଆ'
        },
        os: {
          name: 'Ossetian, Ossetic',
          nativeName: 'ирон æвзаг'
        },
        pa: {
          name: 'Panjabi, Punjabi',
          nativeName: 'ਪੰਜਾਬੀ, پنجابی\u200e'
        },
        pi: {
          name: 'Pāli',
          nativeName: 'पाऴि'
        },
        fa: {
          name: 'Persian',
          nativeName: 'فارسی'
        },
        pl: {
          name: 'Polish',
          nativeName: 'polski'
        },
        ps: {
          name: 'Pashto, Pushto',
          nativeName: 'پښتو'
        },
        pt: {
          name: 'Portuguese',
          nativeName: 'Português'
        },
        qu: {
          name: 'Quechua',
          nativeName: 'Runa Simi, Kichwa'
        },
        rm: {
          name: 'Romansh',
          nativeName: 'rumantsch grischun'
        },
        rn: {
          name: 'Kirundi',
          nativeName: 'kiRundi'
        },
        ro: {
          name: 'Romanian, Moldavian, Moldovan',
          nativeName: 'română'
        },
        ru: {
          name: 'Russian',
          nativeName: 'русский язык'
        },
        sa: {
          name: 'Sanskrit (Saṁskṛta)',
          nativeName: 'संस्कृतम्'
        },
        sc: {
          name: 'Sardinian',
          nativeName: 'sardu'
        },
        sd: {
          name: 'Sindhi',
          nativeName: 'सिन्धी, سنڌي، سندھی\u200e'
        },
        se: {
          name: 'Northern Sami',
          nativeName: 'Davvisámegiella'
        },
        sm: {
          name: 'Samoan',
          nativeName: 'gagana faa Samoa'
        },
        sg: {
          name: 'Sango',
          nativeName: 'yângâ tî sängö'
        },
        sr: {
          name: 'Serbian',
          nativeName: 'српски језик'
        },
        gd: {
          name: 'Scottish Gaelic; Gaelic',
          nativeName: 'Gàidhlig'
        },
        sn: {
          name: 'Shona',
          nativeName: 'chiShona'
        },
        si: {
          name: 'Sinhala, Sinhalese',
          nativeName: 'සිංහල'
        },
        sk: {
          name: 'Slovak',
          nativeName: 'slovenčina'
        },
        sl: {
          name: 'Slovene',
          nativeName: 'slovenščina'
        },
        so: {
          name: 'Somali',
          nativeName: 'Soomaaliga, af Soomaali'
        },
        st: {
          name: 'Southern Sotho',
          nativeName: 'Sesotho'
        },
        es: {
          name: 'Spanish; Castilian',
          nativeName: 'español, castellano'
        },
        su: {
          name: 'Sundanese',
          nativeName: 'Basa Sunda'
        },
        sw: {
          name: 'Swahili',
          nativeName: 'Kiswahili'
        },
        ss: {
          name: 'Swati',
          nativeName: 'SiSwati'
        },
        sv: {
          name: 'Swedish',
          nativeName: 'svenska'
        },
        ta: {
          name: 'Tamil',
          nativeName: 'தமிழ்'
        },
        te: {
          name: 'Telugu',
          nativeName: 'తెలుగు'
        },
        tg: {
          name: 'Tajik',
          nativeName: 'тоҷикӣ, toğikī, تاجیکی\u200e'
        },
        th: {
          name: 'Thai',
          nativeName: 'ไทย'
        },
        ti: {
          name: 'Tigrinya',
          nativeName: 'ትግርኛ'
        },
        bo: {
          name: 'Tibetan Standard, Tibetan, Central',
          nativeName: 'བོད་ཡིག'
        },
        tk: {
          name: 'Turkmen',
          nativeName: 'Türkmen, Түркмен'
        },
        tl: {
          name: 'Tagalog',
          nativeName: 'Wikang Tagalog, ᜏᜒᜃᜅ᜔ ᜆᜄᜎᜓᜄ᜔'
        },
        tn: {
          name: 'Tswana',
          nativeName: 'Setswana'
        },
        to: {
          name: 'Tonga (Tonga Islands)',
          nativeName: 'faka Tonga'
        },
        tr: {
          name: 'Turkish',
          nativeName: 'Türkçe'
        },
        ts: {
          name: 'Tsonga',
          nativeName: 'Xitsonga'
        },
        tt: {
          name: 'Tatar',
          nativeName: 'татарча, tatarça, تاتارچا\u200e'
        },
        tw: {
          name: 'Twi',
          nativeName: 'Twi'
        },
        ty: {
          name: 'Tahitian',
          nativeName: 'Reo Tahiti'
        },
        ug: {
          name: 'Uighur, Uyghur',
          nativeName: 'Uyƣurqə, ئۇيغۇرچە\u200e'
        },
        uk: {
          name: 'Ukrainian',
          nativeName: 'українська'
        },
        ur: {
          name: 'Urdu',
          nativeName: 'اردو'
        },
        uz: {
          name: 'Uzbek',
          nativeName: 'zbek, Ўзбек, أۇزبېك\u200e'
        },
        ve: {
          name: 'Venda',
          nativeName: 'Tshivenḓa'
        },
        vi: {
          name: 'Vietnamese',
          nativeName: 'Tiếng Việt'
        },
        vo: {
          name: 'Volapük',
          nativeName: 'Volapük'
        },
        wa: {
          name: 'Walloon',
          nativeName: 'Walon'
        },
        cy: {
          name: 'Welsh',
          nativeName: 'Cymraeg'
        },
        wo: {
          name: 'Wolof',
          nativeName: 'Wollof'
        },
        fy: {
          name: 'Western Frisian',
          nativeName: 'Frysk'
        },
        xh: {
          name: 'Xhosa',
          nativeName: 'isiXhosa'
        },
        yi: {
          name: 'Yiddish',
          nativeName: 'ייִדיש'
        },
        yo: {
          name: 'Yoruba',
          nativeName: 'Yorùbá'
        },
        za: {
          name: 'Zhuang, Chuang',
          nativeName: 'Saɯ cueŋƅ, Saw cuengh'
        }
      }
      
      var localeLangs = {
        "af-za": [
            "Afrikaans",
            "Afrikaans"
        ],
        "ar": [
            "العربية",
            "Arabic"
        ],
        "bg-bg": [
            "Български",
            "Bulgarian"
        ],
        "ca-ad": [
            "Català",
            "Catalan"
        ],
        "cs-cz": [
            "Čeština",
            "Czech"
        ],
        "cy-gb": [
            "Cymraeg",
            "Welsh"
        ],
        "da-dk": [
            "Dansk",
            "Danish"
        ],
        "de-at": [
            "Deutsch (Österreich)",
            "German (Austria)"
        ],
        "de-ch": [
            "Deutsch (Schweiz)",
            "German (Switzerland)"
        ],
        "de-de": [
            "Deutsch (Deutschland)",
            "German (Germany)"
        ],
        "el-gr": [
            "Ελληνικά",
            "Greek"
        ],
        "en-gb": [
            "English (UK)",
            "English (UK)"
        ],
        "en-us": [
            "English (US)",
            "English (US)"
        ],
        "es-cl": [
            "Español (Chile)",
            "Spanish (Chile)"
        ],
        "es-es": [
            "Español (España)",
            "Spanish (Spain)"
        ],
        "es-mx": [
            "Español (México)",
            "Spanish (Mexico)"
        ],
        "et-ee": [
            "Eesti",
            "Estonian"
        ],
        "eu": [
            "Euskara",
            "Basque"
        ],
        "fa-ir": [
            "فارسی",
            "Persian"
        ],
        "fi-fi": [
            "Suomi",
            "Finnish"
        ],
        "fr-ca": [
            "Français (Canada)",
            "French (Canada)"
        ],
        "fr-fr": [
            "Français (France)",
            "French (France)"
        ],
        "he-il": [
            "עברית",
            "Hebrew"
        ],
        "hr-hr": [
            "Hrvatski",
            "Croatian"
        ],
        "hu-hu": [
            "Magyar",
            "Hungarian"
        ],
        "id-id": [
            "Bahasa Indonesia",
            "Indonesian"    
        ],
        "is-is": [
            "Íslenska",
            "Icelandic"
        ],
        "it-it": [
            "Italiano",
            "Italian"
        ],
        "ja-jp": [
            "日本語",
            "Japanese"
        ],
        "km-km": [
            "ភាសាខ្មែរ",
            "Khmer"
        ],
        "ko-kr": [
            "한국어",
            "Korean"
        ],
        "lt-lt": [
            "Lietuvių",
            "Lithuanian"
        ],
        "lv-lv": [
            "Latviešu",
            "Latvian"
        ],
        "mn-mn": [
            "Монгол",
            "Mongolian"
        ],
        "nb-no": [
            "Norsk bokmål",
            "Norwegian (Bokmål)"
        ],
        "nl-nl": [
            "Nederlands",
            "Dutch"
        ],
        "nn-no": [
            "Norsk nynorsk",
            "Norwegian (Nynorsk)"
        ],
        "pl-pl": [
            "Polski",
            "Polish"
        ],
        "pt-br": [
            "Português (Brasil)",
            "Portuguese (Brazil)"
        ],
        "pt-pt": [
            "Português (Portugal)",
            "Portuguese (Portugal)"
        ],
        "ro-ro": [
            "Română",
            "Romanian"
        ],
        "ru-ru": [
            "Русский",
            "Russian"
        ],
        "sk-sk": [
            "Slovenčina",
            "Slovak"
        ],
        "sl-si": [
            "Slovenščina",
            "Slovenian"
        ],
        "sr-rs": [
            "Српски / Srpski",
            "Serbian"
        ],
        "sv-se": [
            "Svenska",
            "Swedish"
        ],
        "th-th": [
            "ไทย",
            "Thai"
        ],
        "tr-tr": [
            "Türkçe",
            "Turkish"
        ],
        "uk-ua": [
            "Українська",
            "Ukrainian"
        ],
        "vi-vn": [
            "Tiếng Việt",
            "Vietnamese"
        ],
        "zh-cn": [
            "中文 (中国大陆)",
            "Chinese (PRC)"
        ],
        "zh-tw": [
            "中文 (台灣)",
            "Chinese (Taiwan)"
        ]
    }
    lang = lang.toLowerCase()
    if(lang.length == 2){
        if(isoLangs[lang] != null){
            return isoLangs[lang].name;
        }
        else{
            return lang;
        }
    }
    else if(lang.length > 2){
        if(localeLangs[lang] != null){
            return localeLangs[lang][1];
        }
        else{
            return lang;
        }
    }
    else{
        return lang;
    }
}