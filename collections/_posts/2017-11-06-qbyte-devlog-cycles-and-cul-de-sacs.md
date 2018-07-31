---
layout: post
title: "QByte Devlog - Cycles and Cul-de-sacs"
date: 2017-11-06 17:00:00 +0100
categories: why
tags:
  - quantum-byte
description: Getting lost in the quantum (but also the actual) desert
canonical_url: 'https://medium.com/seethrough-studios/qbyte-devlog-cycles-and-cul-de-sacs-2a0c361845a2'
image: https://cdn-images-1.medium.com/max/8064/1*0oGIuQ6un8Cyur9c7wbULg@2x.jpeg
source: medium
---

*You can find the current build of QByte [here](https://developer.cloud.unity3d.com/share/-1a8nk7OAz/). It’s really an in-between build, so expect some broken-ness.*

It’s been about 6 weeks since I last did a devlog for QByte, and while I’ve definitely made progress, that progress has felt slight, to say the least. It’s the reason I’ve not really written about the project in that time (which, well, is a bit backwards – I’ve realised that to a point, writing about progress each week helps drive that progress).

Part of the reason is that I’ve been a bit lost personally. While I’m pretty clear on this project and it’s goals, I’ve been tossing up what happens around and past that project. Daniel, Rob and I have been looking into working as a collective, but it’s become clear that while we all do want to work together, our individual priorities and goals don’t currently align well enough for that. What we want to do might be more like a virtual co-working space or meetup group.

Which leaves me wondering what my next steps are. I’ve been wanting to start a Patreon, but should I do that now, or later? There are definitely opportunities for work and/or funding for QByte, but is now the right time to pursue those? And after a number of difficult weeks for development (more on that later), a January launch looks pretty tricky – am I OK with that?

Coupled with those aforementioned development hurdles and moving cities twice (I’m back in Australia! Which is great but also draining?), I’m feeling a little frayed. It’s worrying that I’m only just starting to feel like I’ve got back some sort of rhythm, and that I can start building back to some sort of normalcy. I’ve got a plan to fix this — step 1 is to write this devlog.

But enough angst, let’s get onto the dev itself.

### Oh my O-Auth

Week one was a lot of a wash. I went in so excited and hopeful, with a clear plan for how I was going to implement saved sessions with limited development (using [Firebase](https://firebase.google.com)), and, having done that, I’d move onto a kick-ass editor for writers to work on the game. I even had a whole week to work on this, so I was sure I’d make good progress!

Turns out that integrating routine web services into Unity is the worst.

The problem isn’t just integrating Firebase (though that in itself is not trivial), but getting authentication to work across all the platforms you want it to. Firebase’s own authentication is a no-go, so you’re left wanting to use O-Auth. But assuming you want to have an app that works on, say, both WebGL and mobile, implementing OAuth in Unity in a way that’s not super annoying to your user is, well, much harder than you’d think.

A week later and I’d made marginal progress. At the end of it, I decided that I was done and ran off to the desert*.

![The desert. Turns out that camels are really comfortable to ride when going uphill but terrible when going downhill](https://cdn-images-1.medium.com/max/8064/1*0oGIuQ6un8Cyur9c7wbULg@2x.jpeg)*The desert. Turns out that camels are really comfortable to ride when going uphill but terrible when going downhill*

\* *OK, so I’d already planned to go to the desert. But after that first week, I think I’d have gone anyway…*

### Skins, Stories and Rabbit Holes

The next couple of weeks actually had me getting a bit of traction back, but increasingly had me ‘Rabbit-Holing’ — that is, building bits of systems that then forced me to build other systems, which forced me to then build other systems... it got a little bit scary.

To start with, I changed my focus to actually getting a story view of the game working, complete with emoji for symbols.

To do this, I needed a skinning system: a way to quickly and easily switch from one look and feel to another. I’m doing this because I’m going to want to let players switch from one to the other, to better understand the game.

This worked pretty damned well, actually. I can specify prefabs as being ‘Skinned Objects’, and other objects as being ‘Skinned Object Parents’. The parents then spawn and despawn the skinned objects as necessary, based on what objects are registered to the skin.

I ended up with this:

![Changing Skins — from the ‘Circuit’ view to the ‘Emoji’ view and back again](https://cdn-images-1.medium.com/max/2044/1*rF25VKIferBV1Ix28Zevng.gif)*Changing Skins — from the ‘Circuit’ view to the ‘Emoji’ view and back again*

Now that I had the ability to show stories in the engine, it was time to actually build those stories. I built a really simple ‘Explainer’ system, where you click on an object to find out more about it. This presented a really nice opportunity to actually explain the science in an exploratory style, and so I decided to focus on the circuit skin’s version: describing the circuit elements before tackling the harder task of storytelling.

Very quickly, it became clear that this wasn’t going to be trivial. To describe a gate, for instance, you need to have information about whether it has controls, which bits control it and so on. I found myself building a small templating language (somewhat based on [Jekyll](http://jekyllrb.com)) to make this happen. For example, this is the string for a Not gate with at least 1 control.
{% raw %}
```
A {{controls | repeat: 'Controlled '}}Not Gate. Turns 0’s into 1’s and vice versa, if {{ controlNames | list: ', ',' and ' }} {{ controls | pluralize : 'has', 'have' }} a value of 1.
```
{% endraw %}

And this is the result:

![Captions for controlled not gates](https://cdn-images-1.medium.com/max/2000/1*fWqF1FoC5LCuVmEEbXzG5w.gif)*Captions for controlled not gates*

While this is pretty great, building this system invoked the need for 2 more:

* If I’m going to put in a templating system like this, I’ve got to work out how I’m doing localisation before I go much further. Figuring out how to integrate a localisation library with a templating system like this is non-trivial (esp. since the library I’m looking at, [I2 Localization](https://assetstore.unity.com/packages/tools/localization/i2-localization-14884), has *some* of the features that such a templating system would provide)

* It’s pretty clear that I need to visually show what object is currently selected: that is, an ‘object focus’ system so I know what the text refers to. There’s also some thought required about how I should handle mouseover vs click.

You can see how this has gotten a little out of hand, right?

The good news is that all these systems are pretty generic and will be incredibly useful for future projects. It’s worth me spending the time to make them, and to make them well. I’m also using some shared systems for my paid work, which makes for some fantastic code-sharing goodness.

At this point, I had to take a bit of a step back and think about how I’m managing all these systems, and how I can share code between projects well. I was also in the midst of moving my repositories across to [git lfs](https://git-lfs.github.com/) and github, so it was a good time to think this stuff through. I ended up using git submodules and some custom bash scripts to keep track of it all (my paid projects are in Unity Collaborate, which made things a little complicated). Unity can’t release their package management tools soon enough…

### Conferences and Refocusing

This slammed me straight into Melbourne International Games Week, which is a pretty incredible but also ridiculous week of game development conferences and expos. I got a bunch of great ideas for QByte and its development, which definitely helped with the feeling that I’m being pulled in a million different directions. It also really re-enforced some of the basic interface issues that I’ve been wanting to fix for a while.

In the wake of this, I had to take stock a bit. I ended up deciding to fix those small niggling issues, and focus on getting the app to the point where I can actually just hand it to someone and have them use it somewhat effectively.

The two main areas that need work are the state representations, and indicating how to make controls. So far, I’ve started on the state representations.

My plan for these is to simplify them a lot so they’re easier to read, and then allow players to get more information as needed. Rather than showing \|0>, -\|0>, \|1> and -\|1> as separate sections on the state, I’m simply going to split the state into the probabilities of collapsing to \|0> and \|1>, and then split these into +’ve and -’ve sections.

Unfortunately, this plan means that entangled states no longer line up nicely, the way they used to. So the plan is to let players click/touch on parts of an entangled state in order to see how they relate to other states.

So far, I’ve got the first (ie. the easy) bit done, and I’ve also changed the colour scheme to use a Brewer Palette (thanks to [John Kane](https://twitter.com/gritfish) for suggesting these). I’ve broken some of the input systems and completely broken Measurement along the way, so I’ll have to fix those as well.

![Somewhat broken, but definitely prettier…](https://cdn-images-1.medium.com/max/2432/1*paF_0mSObNaefF_YgZ5q3g.png)*Somewhat broken, but definitely prettier…*

### Coming up next…

![My Current todo list](https://cdn-images-1.medium.com/max/2000/1*74F1-Qxoqh7IzVCQVCfK5A.png)*My Current todo list*

So this is my current todo list. It’s a little scary… I’m hoping I get the first 2 items done by next week, but we’ll just have to see how I go.

In the meantime, I’d like to know if other developers would be interested in using/contributing to the modules I’m putting together. This is the list of modules I’ve got so far — if you think you’d use any of these let me know, so I can prioritise clean-ups for them.

* simple.deps — a really simple bash-script-driven way of sharing code across different projects (works for git and Unity Collaborate, though it mostly assumes a single programmer for Collaborate). It’s really basic and very manual (no sub-dependencies etc. yet), but I’ll probably add to it as I go

* QSim — A quantum computer simulator for small #’s of bits, optimised for timely user feedback

* Imparter — A system for storing info about game versions and sharing those in your builds. It’s the little toolbar in the top-right of the game.

* Explainer — A system for explaining objects in the game. Click on an object to get an explanation. I’m expanding this to include dealing with object focus, handling mouseovers etc.

* LookChanger — A skinning system

* Somethington — Basic singleton and singleton-like classes

* WordExpander — A string templating system. Ideally will integrate with I2 Localisation
