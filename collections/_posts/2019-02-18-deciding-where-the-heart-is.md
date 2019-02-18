---
layout: post
title: "Deciding Where the Heart Is: A Global Game Jam 2019 'game' postmortem"
date: 2019-02-18 13:00:00 -0500
categories: why
tags:
  - where-the-heart-is
description: A postmortem of my Global Game Jam project
canonical_url: 'https://medium.com/@pdyxs/deciding-where-the-heart-is-4484b5476fa1'
image: https://cdn-images-1.medium.com/max/1600/1*3bSWZFycxSNjlN---YfbAg.png
source: medium
---
### **Deciding Where the Heart Is**

**A Global Game Jam 2019 “game” postmortem**

The theme for Global Game Jam this year, ‘What Home Means to You’, struck me
more than most. As a professionally homeless person, the question of what ‘home’
is has been an ongoing evolution. I don’t really consider Sydney ‘my home’
anymore, even though I do say “I’m going home in March” to mean “I’m going to
Sydney in March”. But that’s mostly because I’m Australian (which means I’m lazy
with language), I know people will understand me, and there’s 2 less syllables
and probably another sentence of explanation less if I just use the ‘h’ word.

But the idea of home is still important, and there are definitely times in my
travels that I feel like I’m at home, and times that I don’t. And while I
wouldn’t exclusively call Sydney home, it has those qualities.

I guess that what I’m trying to say is that I don’t associate home with a
singular place, in the way that “I’m going home in March” would suggest.

So when I was faced with this theme in a room full of Ecuadorians after sitting
through 2 hours of game development talks I could only comprehend at a very
surface level (mi español no es bueno), I knew that I wanted to make something
about what I considered to be home.

Which meant that I was probably doing a solo project, as I probably wanted more
creative control than would be fair to a team, and would be making something
weirder than they wanted to. Which was very much confirmed after a very strange
brainstorming session with an incredibly kind group, of which only half spoke
English (let’s be honest: it was basically two semi-connected brainstorming
sessions happening concurrently).

What came out of this is “Where the Heart is”. It’s not really a game, but it’s
definitely an interactive thing.

If you haven’t tried “Where the Heart is”, maybe do that now. You can find it
over at [https://wheretheheartis.surge.sh](https://wheretheheartis.surge.sh)

![](https://cdn-images-1.medium.com/max/1600/1*3bSWZFycxSNjlN---YfbAg.png)
<span class="figcaption_hack">The final product of “Where the Heart Is”</span>

#### **The Vision**

The basic premise behind ‘Where the Heart Is’ was that home, or that feeling of
homeliness, is mostly about people. There’s definitely a feeling of
understanding a place that’s a part of it as well, but the people make up the
vast bulk of that feeling. Sydney feels like home because of the people I visit
when I go there — it’s because of the people that I want to go back once a year.

There was a time when all of the people that meant home were in one place:
Sydney. However, as I’ve travelled more and meet and have gotten to know more
amazing people, and as the people I know move and travel themselves, home has
stretched as well. It feels thinner, more tenuous, but also more diverse.

“Where the Heart Is” aims to visualise that feeling, by using a force-directed
graph to have a person’s connections to various places pulling on their heart in
a very visceral way. Players can choose where they travel (or if they travel),
and see how their heart is stretched over time.

#### **The Basics**

The basic underpinning of this whole thing was to:

1.  have a globe that the player can rotate;
1.  have players click/tap on it to travel to places (only on land, sorry
sailing/kayaking/shipping/boating/long-distance swimming/submarining
enthusiasts);
1.  have connections pop up; and
1.  have a force-directed graph that dragged a heart around based on those
connections (a force-directed graph is just a visualisation of connected
objects, where the connections act like elastic bands that pull the objects
around)

I’ll do a bit of a break-down of how I did these things below. Warning: here
thar be tech-talk.

**1. Making a globe**

The basis of all of this was [d3](https://d3js.org), which kind of does a lot of
the work for you. A combination of this and some [really nicely-formatted
data](https://geojson-maps.ash.ms/) made this pretty quick to put together.

It also helped that I’ve done this before, doing the prototype for [Plan A’s
homepage](https://plana.earth). The big sticking point for both projects was the
drag to rotate interaction: it turns out that mapping x and y co-ordinates of
mouse drags to 3D rotations isn’t trivial (or at least if you make it trivial,
it’s not quite as smooth as you’d want it to be). With a ticking clock, I just
did it the simple way: x axis movement rotates longitude and y axis movement
rotates latitude, linearly (so moving m pixels always rotates n degrees). I
popped some limits on the latitude rotations coz it felt better that way, and
that was that. One day I’ll get around to putting together a really nice
rotation algorithm for this: [Jason Davies has some cool
approaches](https://www.jasondavies.com/maps/rotate/) for this, but I’ve got a
few tweaks I’d want to make.

**2. Click to move**

This, at a basic level, was pretty easy. D3 has some great tools for moving from
orthographic (globe) coordinates to screen coordinates and vice-versa.

Harder was making the lines between stops. I was pretty keen to have a record of
where you’d been, and to have those actually leap off the globe as you hopped
from place to place — this was important because the links to the heart were
going to be on the surface of the earth, and it’d be hard to read if the lines
were all on the same level.

Making things more difficult was the way that depth works in d3 when you’re
using svgs (rather than webgl). The globe on the screen is actually a flat
vector image that d3 is recalculating whenever you rotate it etc., which means
that when you place, say, a point on the surface of the globe, you need to
manually check if that point is on the hidden side of the globe and hide it if
it is. For a line that actively changes height above the earth, this gets more
complex. For simplicity’s sake, I simply split the line into tiny segments, and
checked if each segment was on the ‘dark’ side (you’ll notice that the lines
disappear too early, which is a symptom of this approach). There’s definitely
better ways that I’ve thought of since (and it would’ve been awesome to give the
lines a width that changed with distance from the viewer), but the clock was
ticking!

![](https://cdn-images-1.medium.com/max/1600/1*AVzWuMt3gicS4B7vT-Ec5g.png)
<span class="figcaption_hack">Making the ‘travel’ lines pop off the globe makes them easy to distinguish from
the ‘heart’ lines</span>

**Making Connections**

This was pretty trivial compared to the rest of this. Pop out an entity every so
often, give the entity some sort of representation on the screen. There’s some
fun things that happen to the look of these when they’re near the top/bottom of
the globe (as I’m just using circles and they don’t warp the way that things on
the surface of a globe should), but otherwise there’s nothing too crazy here.

![](https://cdn-images-1.medium.com/max/1600/1*TJg4VerJJjggxa3QO_57ew.png)
<span class="figcaption_hack">Left: A nice circle of circles. Right: hmmm….</span>

**Forcing matters of the heart**

Again, d3 came to the rescue here (OK, a lot of the initial vision may have come
about because I knew that d3 did this pretty easily). d3-force is a
force-graphing library that comes for free with d3, so it’s just a matter of
plugging that in, right?

I mean, mostly it was that. There were a few things that showed up that were
interesting:

* Making a force-directed graph that used orthographic co-ordinates properly took
a bit of thought (basically a place at -179 longitude should be close to a place
at +179 longitude, and the links between those things shouldn’t wrap the entire
globe)
* Force-directed graphs generally like for all the nodes to just float where they
like, which was decidedly *not* what I wanted. I wanted the heart to float
wherever it wanted, the player’s current location to be completely fixed, and
connection locations to be mostly fixed (with the caveat that they don’t overlap
each other or the player location)
* Creating the lines linking the heart to the various connections is non-trivial:
you can’t just make straight lines, because, well, they’ll be straight (instead
of curving as they go around the globe). Luckily I’d solved a harder version of
this for showing the lines of travel earlier, so maybe it was trivial.

**A start to the heart**

The features here are basically what I started with, and that version of the
game was pretty damned ugly but was starting to take shape.

![](https://cdn-images-1.medium.com/max/1600/1*JHMfjLTO63pymJVxyh8rIQ.png)
<span class="figcaption_hack">The admittedly quite ugly first pass of “Where the Heart Is”</span>

#### **Time Warps**

Something that became clear pretty early on is that the game needed some sort of
time component: that is, if you’re in a place, how long are you there? And how
often do you make new connections in a place?

Something I wanted to model is how time when travelling doesn’t really work
linearly: the first couple of days in a new place are always heightened and feel
‘slower’, and time then seems to speed up as you grow accustomed to the way that
place works and the people there. And in a similar way, you’re much more likely
to meet new people on your first day in a place than in your 30th. On the first
day you’re more socially desperate, more willing to start conversations etc.
Once you’ve made a few connections in a place, focus shifts to deepening those
connections rather than making new ones.

So I added a timer for how long you’d been in a place, and tied it to an
exponential curve: each second in real-world time takes longer in game time,
based on how much game time has already elapsed. There’s a limit to the rate (1
game year every 4 real-world seconds), because otherwise the numbers go to
infinity pretty quickly. Meanwhile, the rate of connections is based on
real-world time only, simulating that effect of looking for connections more
when you have less of them.

If I did this again, I’d probably slow down the overall timer a bit (though I’d
keep the basic exponential curve): it goes a little too quickly for my liking.
I’d also probably tie the rate of connections to the number of connections you
have in that place.

#### **Too many Arts to Art**

As soon as I had connections showing up in places, I knew I needed to have more
than dots to personalise these people. You needed some way to actually see who
you’d met in each places and who was pulling at your heartstrings. Also without
this, it really wasn’t clear that these were people at all.

Now, the immediate issue was that I wanted a wide variety of people, and there
simply wasn’t time to draw that many people. So I turned to emoji, which gave me
a lot of different people for free (thanks
[Twemoji](https://twemoji.twitter.com/)!). As a bonus, emoji have a fair amount
of diversity (it’s not perfect by any stretch, but it’s a pretty great start),
and people already project emotion onto them.

I couldn’t just use all emoji, as there’s a lot that don’t really make sense in
this context, and I didn’t want to spend time making complicated judgement
calls, so I picked emoji that fit into 3 categories: people, animals and places.
Anything that didn’t fit those categories (hand signals, groups of people, faces
etc.) went away, and I made sure that the connections on the map were colour
coded appropriately.

#### **People moving**

Finally, I got the people to move. Because people don’t always stay in the same
place, and even if you aren’t the one travelling, those around you will.

To do this, I basically just made a field for each person that was the amount of
time before they moved, in game time, and just kept track of that. Because it’s
one of the last things I did, I wasn’t able to hone it as much as I’d like
(people move *way* too much, and I’d have liked to have some sort of model of
travel habits — constant travellers vs occasional vacationers etc.). But it
works, so yay!

The more interesting thing to work out was *where* they moved. I needed to
randomly generate co-ordinates that would definitely be on land (because
otherwise the majority of people would move to the high seas), which isn’t super
easy. Thankfully, there’s a [lovely database of city locations made by Johan
Dufor](https://github.com/lutangar/cities.json), all of which are on land! With
a bit of data wrangling (to get the file size down, the original is 12.4MB!), I
just had each person who moved move to a random city co-ordinate.

Which turned out to be a bit… well… I’m not sure exactly why this is, but it
turns out that a large majority of the city locations in that database are in
Europe. Which means that if you run “Where the Heart is” for long enough, most
of your friends will move to Europe. I threw together an algorithm that would
pick a random location on the globe and then choose the closest city to that
point, but that also has problems: everyone moves to tiny islands in the pacific
that you can’t see on the map. Also, that algorithm had some bugs that broke the
whole game, so being a last-minute addition I had to roll it back.

So right now, according to “Where the Heart is”, all your friends will move to
Europe. Whoops.

![](https://cdn-images-1.medium.com/max/1600/1*p_ohmThojNxdvnHpcTGDwA.png)
<span class="figcaption_hack">They all go to Europe in the end…</span>

#### **Done and Dusted**

So, that’s “Where the Heart is”. Overall, I’m pretty happy with where I ended up
with it, though it definitely has some issues (most notably, I’ve avoided having
the game explain itself at all really, and it could probably have a bit more
handholding). Also some music would be nice.

A big thanks to the folks who organised the Quito site of the Global Game Jam.
It was amazing to be able to participate and be welcomed in a place where I
didn’t know the language, and it reminded me of how awesome the game development
community is around the world.

#### **Where to now?**

I’m not going to continue with “Where the Heart is” in it’s current form — I
like it as a Game Jam piece that’s a bit wonky and imperfect as Game Jam pieces
tend to be.

I have, however, been thinking a lot about building a location-driven address
book for myself: as I travel more, the thing I want to know more than anything
is ‘who do I know here?’. And if I did that, I’d probably have it look very
similar to “Where the Heart is”, but with real data. Hell, I might even give it
the same name.

If that’s something you’d be interested in, [sign up
here](https://goo.gl/forms/djaVtW0JOecbMqx62) and I’ll make sure you get access
to alphas/betas etc. No promises on timing though, first I have to finish
building a budgeting app (more on that later…).

In the meantime, I’d love to hear your thoughts on “Where the Heart is”: whether
you were able to work out what the hell it was trying to do without a 2,500 word
explanation; if the things I thought worked, did; if the things that I didn’t,
didn’t; and anything else really.
