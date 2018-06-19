import json
import logging
import os

from flask import Flask, request
import requests
import yaml


PAYLOAD_TITLE = "[{repository[name]}:{branch}] Build #{number} {result_text}"
PAYLOAD_DESCRIPTION = "[`{commit:.7}`]({url}) {message}"
PAYLOAD_COMMIT_URL = "https://github.com/{repository[owner_name]}/{repository[name]}/commit/{commit}"


with open("config.yaml") as file:
    config = yaml.load(file)

DISCORD_WEBHOOK = config["discord-webhook"]
COLORS = config["colors"]


app = Flask(__name__)
# Is this even needed?
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "idk")


@app.route("/webhook", methods=["POST"])
def webhook():
    data = request.form["payload"]
    data = json.loads(data)

    # Force lower because yaml uses lower case
    result = data["status_message"].lower()

    color = COLORS[result]

    time = "started_at" if result == "pending" else "finished_at"

    # PHP example just uses array() but that doesn't make sense...
    # Idk, should ask someone who PHPs
    payload = {
        "username": "Travis CI",
        "avatar_url": "https://i.imgur.com/kOfUGNS.png",
        "embeds": [{
            "color": color,
            "author": {
                "name": data["author_name"]
                # TODO: See if author username can be found in
                # Travis' payload, and then
                # `"icon_url" : "https://github.com/USERNAME.png`
                # as described in https://stackoverflow.com/a/36380674
            },
            "title": PAYLOAD_TITLE.format(**data, result_text=result.capitalize()),
            "url": data["build_url"],
            "description": PAYLOAD_DESCRIPTION.format(**data, url=PAYLOAD_COMMIT_URL.format(**data)),
            "timestamp": data[time]
        }]
    }

    resp = requests.request("POST", DISCORD_WEBHOOK, json=payload, headers={"Content-Type": "application/json"})

    # https://stackoverflow.com/a/19569090
    return resp.text, resp.status_code, resp.headers.items()


@app.errorhandler(500)
def server_error(e):
    logging.exception("Error :/")
    return """
    Idk, server error :/

    <pre>{}</pre>

    sorry
    """.format(e), 500


if __name__ == "__main__":
    app.run(debug=True)
