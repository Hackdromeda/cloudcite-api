from __future__ import print_function
import json

def respond(err, res=None):
    return {
        'statusCode': '422' if err else '200',
        'body': json.dumps('{"error": "Missing query"}') if err else json.dumps(res),
        'headers': {
            'Content-Type': 'application/json',
        },
    }

def lambda_handler(event, context):
    body = json.loads(event['body'])
    query = None
    if 'search' in body:
        query = body['search']
    else:
        return respond(ValueError('Missing query'))
    
    with open('options.json') as f:
        data = json.load(f)
        options = []
        search = query
        for entry in data:
            title = entry['title']
            titleShort = None
            if 'titleShort' in entry:
               titleShort = entry['titleShort']  
            if title is not None and titleShort is None:
                if search in title:
                    options.append(entry)
            elif title is not None and titleShort is not None:
                entire = title + " " + titleShort
                if search in entire:
                    options.append(entry)
            else:
                print("No title for entry!")
        return respond(None, options)