# travis-discord-webhook

Send Travis build notifications to a Discord channel via webhooks - ready to deploy to Heroku in seconds.


## How to set up and deploy

### Getting a Webhook URL

* Go to Discord
* Go to server you have webhook permissions for
* Click server name at top left
* Click "server settings"
* Go to "Webhooks" tab
* "Create Webhook"
* Give it a name (doesn't matter what it is, it'll get renamed to "Travis CI"),
  choose a channel, copy the URL to your clipboard, click save

### Setting it all up

* Install Heroku and Git
* Open Bash or CMD or whatever to a nice directory
* Type `git clone https://github.com/ravendisruptor/travis-discord-webhook.git`
* Type `cd travis-discord-webhook`
* Open `config.yaml` and paste your webhook url next to the `discord-webhook`. Save file
* Type `git commit -am "Add discord webhook"`

**If you're going to be sharing the contents of this repo, or contributing to its development,
make sure you remove your webhook url first.**

### Create a Heroku app and push to it

* Type `heroku login` and login
* Type `heroku create whatever_you_want_it_to_be_called`
* Type `git push heroku master`
* Type `heroku scale web=1`
* Check it's fine with a `heroku ps`

The webhook to add to `.travis.yml` will be https://whatever_you_want_it_to_be_called.herokuapp.com/webhook
(obviously with the name you gave it before)

### Adding the webhook to Travis

* Navigate to your favorite repo
* Edit the `.travis.yml`
* Add the following

```yaml
notifications:
  webhooks: https://whatever_you_want_it_to_be_called.herokuapp.com/webhook
```

  For more options, see
  ["Configuring webhook notifications"](https://docs.travis-ci.com/user/notifications/#Configuring-webhook-notifications)
  in the Travis docs.

* Save it

---

And you're done! Push a build and see if it works!

Doesn't work? Create an issue and I'll see if I can help.

---

## Thanks to:

* zachwill for ["flask_heroku"](https://github.com/zachwill/flask_heroku)
* Techtony96 for ["TravisCI-Webhooks"](https://github.com/Techtony96/TravisCI-Webhooks/) -
  I just nicked the code from here, to be honest.
* StackOverflow

---

## Contributions

Any and all contributions welcome. I want to make modifying and deploying
this as easy as possible to do, so easy that a five-year-old who has just heard
of Bash or CMD would be able to deploy this with ease.

