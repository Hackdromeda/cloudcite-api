const fs = require("fs");
var citeproc = require("citeproc-js-node");

exports.handler = async function(event, context, callback) {
    var request = event.body.replace(/null/g, '""'); // Replace null keys with ""
    if (request == null || request == "") {
        var body = {
            "error": "empty request",
            "explanation": "Our API did not receive anything in the body of the POST request."
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
    try{
        request = JSON.parse(request);
    }
    catch(error){
        console.log(error);
        var err = {
            "error": "malformed request sent",
            "explanation": "The CloudCite API did not receive a properly formatted JSON."
        };
        var response = {
            "statusCode": 400,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials" : true
            },
            "body": JSON.stringify(err),
            "isBase64Encoded": false
        };
        return callback(null, response);
    }
    var lang = "en-US";
    if(request.lang != "" && request.lang != null){
        lang = request.lang;
    }
    else{
        lang = (request.locale).replace("locales-", "");
    }
	var localeLocation = './locales/' + request.locale + '.xml';
	var localeFile = '';
	if(!fs.existsSync(localeLocation)) {
		var body = {
            "error": "locale does not exist",
            "explanation": "Our API could not find the locale that the application requested. Please let us know about this error and the language or locale selected."
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
	else {
        try {
            localeFile = await new Promise((resolve, reject) => {
                fs.readFile(localeLocation, 'utf8', (error, data) => {
                    if (error) {
                        reject(error);
                    }
                    else resolve(data);
                });
            })
         }
         catch (error) {
            var err = {
                "error": "locale file read failed",
                "explanation": "There was an unknown error creating your bibliography. Let us know about the locale, language, or style selected."
            };
            var response = {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin" : "*",
                    "Access-Control-Allow-Credentials" : true
                },
                "body": JSON.stringify(err),
                "isBase64Encoded": false
            };
            return callback(null, response);
         }
    }
	var styleLocation = './styles/' + request.style + '.csl';
    var styleString = ''; 
	if(!fs.existsSync(styleLocation)) {
		var body = {
            "error": "style does not exist",
            "explanation": "Our API could not find the style that the application requested. Please let us know about this error and the style selected."
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
	else {
        try {
            styleString = await new Promise((resolve, reject) => {
                fs.readFile(styleLocation, 'utf8', (error, data) => {
                    if (error) {
                        reject(error);
                    }
                    else resolve(data);
                });
            })
        }
        catch (error) {
            console.log(error)
            var err = {
                "error": "style read failed",
                "explanation": "There was an unknown error creating your bibliography. Let us know about the locale, language, or style selected."
            };
            var response = {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin" : "*",
                    "Access-Control-Allow-Credentials" : true
                },
                "body": JSON.stringify(err),
                "isBase64Encoded": false
            };
            return callback(null, response);
        }
        var parentpath = "";
        if(request.style.includes("dependent/")){
            parentpath = styleString.match(/<link.*?href="?(https?:\/\/[\w.\-/]*)"?.*?rel="?independent-parent"?.*?\/>/gi);
            if(parentpath[0] != null){
                parentpath = parentpath[0].match(/https?:\/\/www\.zotero\.org\/styles\/([\w-]*)/i)
            }
            else{
                parentpath = request.style;
            }
            if(parentpath[1] != null){
                parentpath = parentpath[1];
            }
            else{
                parentpath = request.style;
            }
            styleLocation = './styles/' + parentpath + '.csl';
            if(!fs.existsSync(styleLocation)) {
                var body = {
                    "error": "parent style does not exist",
                    "explanation": "Our API could not find the parent style that the application requested. Please let us know about this error and the dependent style selected."
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
            else {
                try {
                    styleString = await new Promise((resolve, reject) => {
                        fs.readFile(styleLocation, 'utf8', (error, data) => {
                            if (error) {
                                reject(error);
                            }
                            else resolve(data);
                        });
                    })
                }
                catch (error) {
                    console.log(error)
                    var err = {
                        "error": "style read failed",
                        "explanation": "There was an unknown error creating your bibliography. Let us know about the locale, language, or style selected."
                    };
                    var response = {
                        "statusCode": 400,
                        "headers": {
                            "Access-Control-Allow-Origin" : "*",
                            "Access-Control-Allow-Credentials" : true
                        },
                        "body": JSON.stringify(err),
                        "isBase64Encoded": false
                    };
                    return callback(null, response);
                }
            }
        }
    }
    var bib;
    try{
        var sys = new citeproc.simpleSys();
        sys.addLocale(lang, localeFile);
        var engine = sys.newEngine(styleString, null, null);
        var items = request.csl;
        sys.items = items;
        engine.updateItems(Object.keys(items));
        bib = engine.makeBibliography();
    }
    catch (error) {
        var debug = "Locale: " + request.locale + " Style: " + request.style;
        console.log(debug)
        console.log("Error at Bibliography Creation: " + error)
        var err = {
            "error": "bibliography creation failed",
            "explanation": "There was an unknown error creating your bibliography. Let us know about the locale, language, or style selected.",
            "server": debug
        };
        var response = {
            "statusCode": 400,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials" : true
            },
            "body": JSON.stringify(err),
            "isBase64Encoded": false
        };
        return callback(null, response);
    }
 	if (bib != null || bib != "") {
        var response = {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials" : true
            },
            "body": JSON.stringify(bib),
            "isBase64Encoded": false
        };
        return callback(null, response);
	}
	else {
        console.log("Empty Bibliography")
        var err = {
            "error": "empty bibliography",
            "explanation": "There was an unknown error creating your bibliography. Let us know about the locale, language, or style selected."
		};
        var response = {
            "statusCode": 400,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials" : true
            },
            "body": JSON.stringify(err),
            "isBase64Encoded": false
        };
		return callback(null, response);
    }
}