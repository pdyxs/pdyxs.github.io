---
layout: post
title: "Postmortem: “The Enemy Of My Enemy Is My Heat-Seeking Missile”"
date: 2010-08-26 17:00:00 +1000
categories: why
description: 
image: http://www.ludumdare.com/compo/wp-content/uploads/2010/08/IMG_0088.JPG
---
So its been a couple of days since my game went up, and I thought it was high time I did a post-mortem. To give a bit of background: this is my 2nd flash game ever (number 3 is in the works), and was my first time doing a Ludum Dare, so I'm fairly new to the whole experience. Overall (spoiler alert!) it was an awesome experience that I'm looking forward to repeating(end spoiler).

The game can be [found here](http://www.ludumdare.com/compo/ludum-dare-18/?action=preview&uid=2440){:target="_blank"} -- I'm looking to polish it up and do a re-release, so any suggestions are more than welcome.

Now, onto the experience:

Part 1: Brainstorming
---------------------

My brainstorming session involved me, a whiteboard (pictured below), and Google. The first thing I did was to break down the theme into its two important points: Enemies, and Weapons. Ultimately, the idea of enemies proved to be the more interesting of the two.

![Brainstorming!](http://www.ludumdare.com/compo/wp-content/uploads/2010/08/IMG_0088.JPG)

Brainstorming!

Then I looked up google for sayings about enemies and weapons, and noted the most interesting down. The two that stuck were 'Know your enemy' and 'The enemy of my enemy is my friend'. The first implied a game where you turned your enemies into weapons, but you had to figure out who your enemies actually were. The latter made this more interesting by suggesting a complicated web of alliances which.

These two basic ideas are what informed 'The enemy of my enemy is my heat-seeking missile'. Essentially, the idea is that you find out who your enemies are, find out who their enemies are, and turn them into heat-seeking missiles so they kill your enemies.

At first, I wanted to use a mechanic of asking people questions to find out their allegiances, but this struck me as way too complicated and messy for a 48 hour game. This lead to the idea of using a colour-based detector for allegiances, and so the 'allegiometer' was born.

I'm pretty happy with the basic ideas that came out of this initial brainstorming stage, though they may have been slightly too complex to explore in terms of level design and balancing (the programming aspect turned out to be fine). Which leads us to the next stage:

Part 2: Coding And All Things New And Shiny...
--------------------------------------------

I should probably mention at this stage that this is my first game that required any level design or sprite animation (I've done the graphics programmatically in the past). At this stage, I was putting off the graphics, but one of my first steps was to find a decent level design program and test it. I ended up using Ogmo, and am ridiculously happy with it as a level editing tool.

I got a framework together (using flashpunk as a base) that would read in the map, place the player and the bad guys in and have them interact. I'm really happy with my collision and basic movement code -- I simply got it working in a way I hadn't really done before.

At about hour 10 I hit a bit of a brick wall. First, there was a few dodgy dependency-based bugs (the kind of 'include' loops you expect in C or C++, not in Actionscript), and secondly, there was trig. At this stage, I have to emphasise how much I hate trigonometry. I'm not bad at maths, and really enjoy most math-based aspects of game programming. Trigonometry is not one of them, and it seems to come up every god-damn time. There's too many cases that I never seem to get right the first time, and it often degenerates into guesswork as I get more and more frustrated.

In this game, the trig problem was the angle to point the missiles at as they were rising (so they're pointing at the target at the top). Ultimately, I got it working if the target was below them but not above, but it took so long that I needed to just leave it and move on.

Overall, I'm pretty happy with the code base I made. There's some real dodginess in the scoring screens (magic numbers galore), as they were done really late, but otherwise it's a fairly elegant system.

Part 3: Graphics, (Aka Why There Are Summersaulting Robot Ninjas)
-----------------------------------------------------------------

At about hour 13, I started working on the graphics. I first tried to do silhouetted stick figures, but without a tablet (hell, with a tablet might not have helped) I suck at drawing, so Robots it was!

Robots were easy, and I'm pretty damn happy with how they look in the end, considering the timeframe and my ability. One or two frames in the transformation into missiles were a bit dodgy, and there's a lack of a jump animation.

The lack of tilesets was probably a good move given the timeframe, but the simplistic nature of the graphics did hurt the game a little. It's something I'll definitely look into in the future.

I'm particularly proud of the summersaulting ninja robots that emerge from the terrain (this was half animation, half programming)...

Part 4: Level Design
--------------------

This is the part that probably suffered the most due to the short time frame. I managed to create 20 levels, which was great, but without any playtesting, the difficulty curve was way off and the explanations of mechanics untested. In addition, any playtesting I did was kinda defunct, as I knew what the allegiances of all the robots were (as I had just placed them). So yeah: no playtesting = bad.

I think the levels I came up with demonstrated a decent range of the ideas that could be explored with the mechanic, but often I erred on the side of too easy (apart from a few of the later levels, which go the other way) or on the side of too guess-like. The mechanics of the game can make it easy for levels to devolve into guesswork, and that's something that I worked to avoid, sometimes more successfully than others.

Part 5: Mechanics/Conclusions
-----------------------------

In terms of the overall mechanics of the game, the problems are more in omissions than in alterations: a 'duck' feature would be good, and different types of robots would allow me to better emphasise types of gameplay.

One thing I didn't really get to explore was the idea of the colour wheel. The colours used are the primary and secondary painting colours (not digital colours), and a colour will befriend colours that are next to it, and be enemies with all the others. Even though this was never really used in the game, the decision to do this allowed me to have a pretty nice choice of relationships within levels without ever giving up on consistency.

Another issue is probably the ease of simply killing the evil robots, and the rigidity of the win conditions. Sometimes I should have made it so that the level ends after the timer counts down, and other times it should have put a loss condition of when certain required resources were destroyed.

Overall, I was really happy with this game as a 48 hour attempt. I'm really interested in feedback so I can fix it up (particularly anything on particular levels and their difficulty), so let me know if you have any.
