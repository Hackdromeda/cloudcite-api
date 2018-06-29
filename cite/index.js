const AWS = require('aws-sdk');
const CSL = require("citeproc");
const fs = require("fs"); //move XML en-us to code later
var citeproc = require("citeproc-js-node");
//docs for citeproc https://citeproc-js.readthedocs.io/en/latest/index.html

exports.handler = function(event, context, callback) {
    //var headers = event.headers;
    //headers = ConvertKeysToLowerCase(headers);
    var request = JSON.parse(event.body); //[required: { style: "modern-language-association"}, locale: "locales-en-US", csl: {<csl stuff>}]
    if (request == null || request == "") {
        var body = {
			"error": "empty request"
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
	var sys = new citeproc.simpleSys();
	var localeLocation = './locales/' + request.locale + '.xml';
    var enUS = fs.readFileSync(localeLocation, 'utf8');
	sys.addLocale('en-US', enUS);
	var styleLocation = './styles/' + request.style + '.csl';
    var styleString = fs.readFileSync(styleLocation, 'utf8');
	var engine = sys.newEngine(styleString, 'en-US', null);
	var items = request.csl;
/*     var items = {
  		"14058/RN9M5BF3": {
		"accessed": {
		"month": "9",
		"year": "2010",
		"day": "10"
		},
		"id": "14058/RN9M5BF3",
		"author": [
		{
			"given": "Adel",
			"family": "Hendaoui"
		},
		{
			"given": "Moez",
			"family": "Limayem"
		},
		{
			"given": "Craig W.",
			"family": "Thompson"
		}
		],
		"title": "3D Social Virtual Worlds: <i>Research Issues and Challenges</i>",
		"type": "article-journal",
		"versionNumber": 6816
  		},
		"14058/NSBERGDK": {
			"accessed": {
			"month": "9",
			"year": "2010",
			"day": "10"
			},
			"issued": {
			"month": "6",
			"year": "2009"
			},
			"event-place": "Istanbul",
			"type": "paper-conference",
			"DOI": "10.1109/DEST.2009.5276761",
			"page-first": "151",
			"id": "14058/NSBERGDK",
			"title-short": "3D virtual worlds as collaborative communities enriching human endeavours",
			"publisher-place": "Istanbul",
			"author": [
			{
				"given": "C.",
				"family": "Dreher"
			},
			{
				"given": "T.",
				"family": "Reiners"
			},
			{
				"given": "N.",
				"family": "Dreher"
			},
			{
				"given": "H.",
				"family": "Dreher"
			}
			],
			"title": "3D virtual worlds as collaborative communities enriching human endeavours: Innovative applications in e-Learning",
			"shortTitle": "3D virtual worlds as collaborative communities enriching human endeavours",
			"page": "151-156",
			"event": "2009 3rd IEEE International Conference on Digital Ecosystems and Technologies (DEST)",
			"URL": "http://ieeexplore.ieee.org/lpdocs/epic03/wrapper.htm?arnumber=5276761",
			"versionNumber": 1
		}
	}; */
    //Test case items
    sys.items = items;
    
    engine.updateItems(Object.keys(items));
    var bib = engine.makeBibliography();
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
		var err = {
			"error": "bibliography creation failed"
		};
		return callback(JSON.stringify(err), null);
	}
} // end of Lambda export