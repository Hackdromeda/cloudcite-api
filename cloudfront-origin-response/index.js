'use strict';
exports.handler = (event, context, callback) => {
    const response = event.Records[0].cf.response;
    const request = event.Records[0].cf.request;
    const headers = response.headers;
    
    headers['report-to'] = [{
        key:   'Report-To', 
        value: JSON.stringify({ "group": "csp-endpoint",
             "max-age": 10886400,
             "endpoints": [
               { "url": "https://cloudcite.report-uri.com/r/d/csp/enforce" }
             ] })
    }];
    
    headers['strict-transport-security'] = [{
        key:   'Strict-Transport-Security', 
        value: "max-age=31536000; includeSubdomains; preload"
    }];

    headers['content-security-policy'] = [{
        key:   'Content-Security-Policy', 
        value: "default-src 'self' *.cloudcite.net *.cloudflare.com *.auth0.com auth0.com *.googleapis.com *.g.doubleclick.net *.ampproject.org *.googlesyndication.com *.ampproject.net; img-src 'self' 'self' data: storage.googleapis.com *.googlesyndication.com *.gstatic.com gstatic.com books.google.com image.tmdb.org *.tmdb.org *.google.com google.com translate.google.com *.googleapis.com data:; script-src 'self' 'unsafe-eval' 'unsafe-inline' *.googlesyndication.com *.google.com *.googleapis.com *.ampproject.org *.ampproject.net data: storage.googleapis.com googleads.g.doubleclick.net ajax.googleapis.com; style-src 'self' 'unsafe-eval' 'unsafe-inline' data: cdn.materialdesignicons.com *.googleapis.com; object-src 'self'; font-src 'self' *.googleapis.com *.gstatic.com cdn.materialdesignicons.com data:; frame-ancestors 'self'; report-uri https://cloudcite.report-uri.com/r/d/csp/enforce; report-to csp-endpoint"
    }];

    headers['x-content-type-options'] = [{
        key:   'X-Content-Type-Options',
        value: "nosniff"
    }];
    
    headers['x-frame-options'] = [{
        key:   'X-Frame-Options',
        value: "DENY"
    }];
    
    headers['x-xss-protection'] = [{
        key:   'X-XSS-Protection',
        value: "1; mode=block"
    }];

    headers['referrer-policy'] = [{
        key:   'Referrer-Policy',
        value: "same-origin"
    }];
    
    headers['feature-policy'] = [{
        key:   'Feature-Policy',
        value: "accelerometer 'none'; ambient-light-sensor 'none'; autoplay 'none'; camera 'none'; encrypted-media 'none'; fullscreen 'none'; geolocation 'none'; gyroscope 'none'; magnetometer 'none'; microphone 'none'; midi 'none'; payment 'none'; picture-in-picture 'none'; speaker 'none'; sync-xhr 'none'; usb 'none'; vr 'none'"
    }];
    
    var url = request.uri;
    const path = require('path');
    // Determine extension
    const extension = path.extname(url).toLowerCase();
    if((/(js|css)$/i).test(extension)){
        headers['cache-control'] = [{
            key:   'Cache-Control',
            value: "max-age=2628000, public"
        }];        
    }
    else if((/(gif|jpg|jpeg|tiff|ico|svg|png)$/i).test(extension)){
        headers['cache-control'] = [{
            key:   'Cache-Control',
            value: "max-age=31536000, public"
        }];        
    }
    else if(extension == ".html"){
        headers['cache-control'] = [{
            key:   'Cache-Control',
            value: "no-cache, no-store, must-revalidate"
        }];                
    }
    else{
         headers['cache-control'] = [{
            key:   'Cache-Control',
            value: "max-age=86400, public"
        }];            
    }
    
    if(url.indexOf("index.html") >= 0 && response.status == 404){
        response.status = 403;
    }
    if(url.indexOf("error/index.html") >= 0){
        response.status = 404;
    }
    
    callback(null, response);
};