---
layout: post
title: "Of Shapes and Flies: A Ludum Dare Double Bill Postmortem"
date: 2011-09-09 17:00:00 +1000
categories: why
tags:
  - flatland-fallen-angle
description:
canonical_url: https://www.gamasutra.com/blogs/PaulSztajer/20110909/90176/Of_Shapes_and_Flies_A_Ludum_Dare_Double_Bill_Postmortem.php
---
**Paul**: As you may have seen, James and I both took part in Ludum Dare a few weekends back, where James made [Web of Flies](http://www.ludumdare.com/compo/ludum-dare-21/?action=rate&uid=4413){:target="_blank"}, and I '[Escape from Flatland: An~~Romance~~ Adventure of ~~Many~~ Two Dimensions](http://www.ludumdare.com/compo/ludum-dare-21/?action=rate&uid=2440){:target="_blank"}'. It was an adventure of coding, design, learning new things, and crazy shape (**James**: and spider web!) physics. It was the most fulfilling 48 hour game challenge either of us have done (this was James' 2nd LD and my 4th), and the resulting games speak to that.

In this postmortem, we didn't really want to make lists of what went right or wrong, so instead we'll lay out some rules we each felt were important going into the weekend (whether we followed them or not), and then talk about how these aspects affected our games.

Seeing as I'm introducing this sucker, I'll start first:

### Rule 1: Gameplay in 6

This, in my opinion, is the most important rule of 48 hour game dev: have gameplay in 6 hours.

'Escape from Flatland' had gameplay in 7 hours (so slightly late), which gave me a huge amount of time to tweak and fix the gameplay within it.

So what is 'gameplay' in this case? To me, it's the core mechanic, that thing that your player will be doing most of the time: whether that's running and jumping, shooting, answering, or (in my case) splicing shapes. The key here is that you should rush towards the most important gameplay feature of your game.

I think it's important to mention that you really don't need to have a perfect grasp on what your game is going to look like in order to get to this first gameplay stage. At hour 7, i knew that the player would be a triangle, and that they'd be splicing other shapes... and that's about it. I didn't know what a level would look like or what the player goals would be, but I knew that splicing shapes would be key.

**James**: So, yeah... I kind of failed with this one. Gameplay in T minus 6 hours?

I guess I have two excuses. Going in, I had no real intention of actually competing (it was the same weekend as PyCon AU 2011, and a dozen other things), so I'd mostly just resigned myself to helping host our little LD party, whilst doing other things all weekend. Of course, enthusiasm is infectious, and I was soon caught up in the action. It didn't excuse me from my other commitments though, so it ended up being a rather fractured weekend with me dashing off every few hours to a concert or whatnot. Self-sabotage at its finest.

The medium I chose was my other real roadblock. Last Ludum Dare, not being a Flash developer, I decided to write my game in JavaScript, using SVGs for the graphics. I quickly found myself hooking into the SVG's internals more and more with the JavaScript though, and before long I realised it would be easier to just script the SVG directly. Soon I was enthralled by the idea of a single SVG image being a game, and it became a personal challenge to make it happen. Unfortunately I was a little overambitious (I'd never actually looked at the internals of an SVG before, and scripting them is a bit quirky), so that weekend ended up just being a very fun, very steep learning curve. I was more successful this time around, though there were still plenty of "Aha!" moments.

I also had a lot of trouble coming up with a game idea, so I started out just implementing all the basic stuff that comes free with other development platforms (player movement, translation between world and screen coordinates, etc.) It was only after about nine hours (while sitting in a Schubert concert), that inspiration finally struck, and I raced back to uni eager to write some spider web physics. The idea was deliberately simplistic; I wanted something small and shiny that would show off the unusual medium, and that I could actually get finished. I could always add to it if there was time (and there wasn't, turns out simple was hard enough :P).

Getting to gameplay in six hours would've saved my game from the parameter-tuning problems it currently has, but I guess this time round I just a bit too disorganised, and still adapting to the challenges of the new medium.

**Paul**: And challenging yourself is really important in getting the most out of Ludum Dare, so much so that I'm gonna go and make a new heading...

### Rule 2: Challenge Yourself

This is, to me, the most important part of Ludum Dare: it's an opportunity to try out new technologies and gameplay types, and doing so is incredibly rewarding.

This time, I went into Ludum Dare with two goals: to learn the Facebook Social API and play with the idea of asynchronous co-operation; and to learn the basics of Ruby on Rails while doing it (more on that one later...). Having this goal helped me to focus my work, forcing me to get to the basic gameplay and design quickly so I could attempt the 'something more'.

More importantly, the social aspects of the game, more than anything else, have given me a plethora of ideas for my other projects. Trying new things and expanding your horizons will help your game design and development in general.

For me, this rule goes hand in hand with another, and seeing as James has already talked about challenges, I'll move onward to...

### Rule 3: Make Trade-offs

If you're going to challenge yourself, you need to make trade-offs. If you don't, you'll find yourself trying to do far too much in not enough time (see my last Ludum Dare game, 'The Way Home', where we tried for an art game which combined and synchronized two completely different gameplay modes... it was a bit of a mess).

If something isn't necessary for your game, cut it or strip it down. Play to your strengths.

One decision I'm grateful I made with "Flatland" was that I wouldn't put much effort into graphics or sound. Graphics would be all drawn in-game without sprites (and so any interesting effects needed to be emergent from gameplay), and I'd use Wolfram Tones and maybe some effects generated from sfxr (I ended up not doing this). As soon as I made this decision, it engendered a specific graphical and audio style which can (and did) work really well without much effort.

**James**: Yep, being able to make tradeoffs is really essential. My original gameplay idea was much more complicated - the web was going to be much larger, a single breakage wouldn't end the game, and there'd be much more of a focus on strategic repair and pathfinding. By the last six hours though, I was pruning away features left and right, and with not enough time to implement the extra mechanics and physics I had planned, gameplay underwent some fairly radical simplifications. It was painful to do, and resulted in a less exciting game, but there wouldn't have been anything to submit otherwise. Thankfully my running buddies came to the rescue here with their cool, logical advice; it was time to just admit defeat and polish up what I already had.

**Paul**: That actually reminds me of another tradeoff I made later on in the development. Initially, I'd decided to do all my serverside scripting in Ruby on Rails, which was partly 'challenge', partly 'a single 2-column table will be pretty easy in rails, and probably quicker (even considering I've never coded in ruby) than php.' Which, let's face it, is true.

What I didn't think about beforehand was that setting up Ruby on Rails on my computer meant rebooting into osx (my flash dev was done in windows) and wasting half an hour setting it up. What I concurrently failed to think about was that setting up on a server somewhere would probably waste the rest of the weekend. Thankfully, I only wasted 1-1.5 hours on that particular tangent before coming back (quite literally, as I actually left our dev site to do this) and doing php (which made me a little sad, but was thoroughly worth it).

### Rule 4: Turn your limitations into features

**James**: Paul's kind of already covered this one with his graphical design, but for me, it was the guiding principle in the design of my game. Last LD it quickly became apparent that I wasn't familiar with any of the standard technologies used in game development, and so I had to work with what I knew. A JavaScript web game quickly morphed into a scripted SVG image, and I realised that this was a rather cool feature in itself - an entire game in a single image! From that point on my lack of Flash knowledge was no longer a limitation, it was the catalyst driving me down an entirely unexpected path. Of course, this time round was different - I deliberately imposed the SVG/JavaScript-only restriction on myself - but it shows how easily even a serious limitation came be turned around into the defining feature of your game.

Obviously this only works to a point though. There are going to be many limitations that are difficult, if not impossible, to dress up as a feature (buggy game logic, poorly balanced gameplay, etc.). But it's worth a shot, right?

**Paul**: It's definitely worth a shot, and to me, it's rather necessary. If, for instance, your controls are difficult to learn, it can mean one of two things: you need to fix it or you need to feature it (and by that, I mean admit it's hard and make that part of the challenge, and probably tutorialise it). That isn't to say that my game's controls would have been fixed by featuring them (you can only feature so much, and they actually needed some thought put into them), but it's a good illustrating example.

As James mentioned, my limitation here was my choice to simplify my graphics. Deciding to go simple on the design could have been a huge drawback in terms of look and feel, but then I spied my copy of 'Flatland' on the shelf. Suddenly, I had a way of turning this drawback into a feature, by setting the game in the world of Flatland.

And with that, I'll awkwardly segue into the next rule...

### Rule 5: Release, Playtest and Tweak

So I got two out of three of these, so it can't be that bad, right?

In actuality, I kinda lucked into playtesting my game. I needed data in my database, and so released a half-finished version and asked for people to play it. And got awesome feedback in the process. I then made some of the tweaks from feedback, but failed to get them all (those awkward controls in the game? unchanged since about hour 4).

Now, I should have known better... I am, after all, a huge proponent of playtesting. And I should really have done a release a bit later on when I had a few more levels, to test out difficulty etc. (as I didn't really polish this aspect, and there was a bit of sloppy level design going on. Also, some playtesting would have made it clear that social aspect wasn't all that clear).

All in all, I could really have done more tweaking of my game. In the last two hours of the comp, I didn't really get much done, and a bit of tweaking would have gone a long way (or, you know, fixing the sound so that the music I'd gotten off WolframTones actually looped rather than playing once and then stopping). In my own defence (against my own accusation? this is getting a little gollumish) I'd slept for 3 and a half hours in 2 days and was in a somewhat delirious 'holy crap I got that much done? that's awesome! It's totally finished' mood (for instance, the idea that the last level might be too ambiguious didn't actually enter my mind).

In the end, I'm really happy with what I made, but you never forget those couple of things you 'coulda, shoulda, woulda' fixed.

**James**: Well, yeah, I was an all-round failure here.

Releases? There was one. About 10 minutes before the end of the comp.

Playtesting? Um, I checked that things moved?

Tweaking? Again, nowhere near enough. Parameters like the spider speed, fly strength, and web repair rate were never really tweaked beyond their original values, and while that might've been okay for what I'd originally planned, it certainly isn't optimal given the direction I ended up going.

In fact, I pretty much gave up on tweaking entirely. In the last half hour when I had a mostly playable game, I started work on cosmetic improvements (making the spider's legs moved as it walked), rather than paying attention to the (probably more critical) playability issues. It was an awkward trade-off, but one I'm not really too upset about. I received a lot of positive feedback from friends regarding the attention to graphical detail, so I guess I'm just glad it didn't go unnoticed.

**Paul**: Yeah, the moving legs were pretty awesome.

I think we've gone through the things we wanted to, so I'll leave it there. Thanks to all those who've given feedback for our games. It's been pretty amazing to be part of this LD48, and to be two of the (patently ridiculously) large number of entries.

From James and myself, thanks to everyone who organised it (and got the server back up and running!), and bring on LD22.
