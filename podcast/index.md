---
layout: basic
title: Refractive Indices
---
### A podcast about how I make and think
#### Currently in alpha

Like so many others in this post-covid world, I've decided to make a podcast. It'll have 10-15 minute episodes about either:
* A process that I do when making things;
* A project that I'm currently working on (and a specific problem I'm solving for it); or
* A design concept I'm thinking about

I've made three 'alpha' podcasts, to try out the sorts of things I could talk about and to get some feedback before I go and make a feed, find a theme tune and so on. I'd really appreciate it if you could take a moment to listen to them and send me your feedback.

<form action="#" onsubmit="doSubmitPodcastForm(this); return false">
  <div class="row">
    <div class="col-md-4 mb-2">
      <div class="card">
        <div class="card-header bg-info text-white">
          <h5 class="card-title mb-0">A01 - Naming</h5>
        </div>
        <div class="card-body">
          <p class="card-text">
            Where I talk about the process of naming things, how I'm approaching naming my brand, and why this podcast has this name. All while constantly getting the name of the podcast wrong.
          </p>
          <audio controls>
            <source src="./a01 - naming.mp3" type="audio/mpeg">
            Your browser does not support the audio element.
          </audio>
          <div class="form-check mt-2">
            <input class="form-check-input" type="radio" name="favouriteEpisode" id="favouriteEpisode1" value="1">
            <label class="form-check-label" for="favouriteEpisode1">
              This was my favourite episode
            </label>
          </div>
          <div class="form-group mt-2">
            <label for="episode1Feedback">What did you like, and what didn't work?</label>
            <textarea class="form-control" name="episode1Feedback" id="episode1Feedback" rows="2"></textarea>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-4 mb-2">
      <div class="card">
        <div class="card-header bg-info text-white">
          <h5 class="card-title mb-0">A02 - Goals of The Odysseys</h5>
        </div>
        <div class="card-body">
          <p class="card-text">
            Where I talk about the card game I'm making about The Odyssey, what the game is
            actually about, and how I'm tackling a problem that the game currently faces with
            its goals.
          </p>
          <audio controls>
            <source src="./a02 - odysseys goals.mp3" type="audio/mpeg">
            Your browser does not support the audio element.
          </audio>
          <div class="form-check mt-2">
            <input class="form-check-input" type="radio" name="favouriteEpisode" id="favouriteEpisode2" value="2">
            <label class="form-check-label" for="favouriteEpisode2">
              This was my favourite episode
            </label>
          </div>
          <div class="form-group mt-2">
            <label for="episode2Feedback">What did you like, and what didn't work?</label>
            <textarea class="form-control" name="episode2Feedback" id="episode2Feedback" rows="2"></textarea>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-4">
      <div class="card">
        <div class="card-header bg-info text-white">
          <h5 class="card-title mb-0">A03 - About the Money</h5>
        </div>
        <div class="card-body">
          <p class="card-text">
            Where I discuss an incentive-driven approach to choosing a monetisation strategy,
            which aims to help make sure you don't end up making something that you don't want to.
          </p>
          <audio controls>
            <source src="./a03 - monetisation.mp3" type="audio/mpeg">
            Your browser does not support the audio element.
          </audio>
          <div class="form-check mt-2">
            <input class="form-check-input" type="radio" name="favouriteEpisode" id="favouriteEpisode3" value="3">
            <label class="form-check-label" for="favouriteEpisode3">
              This was my favourite episode
            </label>
          </div>
          <div class="form-group mt-2">
            <label for="episode3Feedback">What did you like, and what didn't work?</label>
            <textarea class="form-control" name="episode3Feedback" id="episode3Feedback" rows="2"></textarea>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="row">
    <div class="col-md-6 offset-md-3">
      <div class="form-group mt-2">
        <label for="overallFeedback">Any other thoughts or feedback?</label>
        <textarea class="form-control" name="overallFeedback" id="overallFeedback" rows="2"></textarea>
      </div>
      <div class="form-group">
        <label for="email">Your name and email (so I can reply to your feedback, and/or send you updates)</label>
        <div class="row">
          <div class="col">
            <input type="text" class="form-control" name="name" placeholder="Your name">
          </div>
          <div class="col">
            <input type="email" class="form-control" name="email" id="email" placeholder="name@example.com">
          </div>
        </div>
      </div>
      <div class="form-check">
        <input class="form-check-input" name="subscribe" type="checkbox" checked>
        <label class="form-check-label" for="subscribe">
          Click here if you want to get updates on what I'm doing, including when the podcast comes out
        </label>
      </div>
      <div class="text-center mb-4 mt-2">
        <input id="question-form-submit" type="submit"
          class="btn btn-primary"
          value="Send feedback" />
      </div>
    </div>
  </div>

</form>

<script>
  function doSubmitPodcastForm(form) {
    var data = new FormData(form);
    xhr = new XMLHttpRequest();
    var url = "https://discordapp.com/api/webhooks/762818216338653184/Fk_8oiiK2Gbr9xGOuVittd58zRZ485Wri8DnnZsRDdA4_6sKfVp2Swm7B_Lcwy4CpvEw";
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-type", "application/json");
    var jsonString = JSON.stringify({
      content: "Podcast Feedback from " + data.get("name") + " (" + data.get("email") + "):",
      "embeds": [
        {
          "title": "Episode 1 Feedback",
          "description": data.get("episode1Feedback"),
          "color": 7506394
        },
        {
          "title": "Episode 2 Feedback",
          "description": data.get("episode2Feedback"),
          "color": 7506394
        },
        {
          "title": "Episode 3 Feedback",
          "description": data.get("episode3Feedback"),
          "color": 7506394
        },
        {
          "title": "Overall Things",
          "description": "Favourite Episode: " + data.get("favouriteEpisode"),
          "fields": [
            {
              "name": "Feedback",
              "value": data.get("overallFeedback").length > 0 ? data.get("overallFeedback") : "(none)"
            }
          ],
          "color": 15746887,
          "footer": {
            "text": "Subscribe: " + (data.get("subscribe") == "on")
          }
        }
      ]
    });
    xhr.send(jsonString);

    setTimeout(function() {
      window.location.href = "http://pdyxs.wtf/podcast/submitted";
    }, 500);
  }
</script>
