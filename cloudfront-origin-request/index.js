'use strict';

const path = require('path');

exports.handler = (event, context, callback) => {
    
    // Extract the request from the CloudFront event that is sent to Lambda@Edge 
    var request = event.Records[0].cf.request;

    // Extract the URI from the request
    var olduri = request.uri;

    // Match any '/' that occurs at the end of a URI. Replace it with a default index
    var newuri = olduri.replace(/\/$/, '\/index.html');
    
    // Log the URI as received by CloudFront and the new URI to be used to fetch from origin
    console.log("Old URI: " + olduri);
    console.log("New URI: " + newuri);
    
    // Replace the received URI with the URI that includes the index page
    request.uri = newuri;

    // Determine extension
    const extension = path.extname(olduri);
    
    // Log extension
    console.log("Extension: " + extension);

    // Return to CloudFront if extension
    if(extension != null && extension.length > 0){
        return callback(null, request);
    }
    
    // Check if already trailing slash
    const last_character = olduri.slice(-1);
    
    // Return to CloudFront if has trailing slash
    if(last_character == "/"){
        return callback(null, request);
    }

    // Add trailing slash  
    const new_url = `${olduri}/`;
    
    // Debug
    console.log(`Rewriting ${olduri} to ${new_url}...`);

    // Create HTTP 301 Redirect
    const redirect = {
        status: '301',
        statusDescription: 'Moved Permanently',
        headers: {
            location: [{
                key: 'Location',
                value: 'https://cloudcite.net' + new_url,
            }],
        },
    };
    
    return callback(null, redirect);

};