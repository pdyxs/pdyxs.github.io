---
layout: post
title: "Making it together: Parallel Implementation"
date: 2011-11-27 17:00:00 +1000
categories: why
description:
tags:
  - particulars
canonical_url: https://www.gamasutra.com/blogs/PaulSztajer/20111127/90690/Making_it_together_Parallel_Implementation.php
source: gamasutra
---
This is going to be a pretty quick post, but it's something I've been pondering on lately. It concerns the actual development (programming) of a game project.

In developing Particulars, we've very much taken a gameplay first approach in our programming, and that's lead to some really nice and interesting gameplay. What's becoming apparent, however, is that doing so has left us with a lot of comparatively 'boring' catch-up work making tools for level designers and artists. And on a part-time indie team, having only this sort of work ahead of you can be daunting and damaging to momentum.

Enter Unity3D. And by that, surprise announcement: we're changing development tracks from XNA to Unity. This post isn't about that (and there's more to this move than just the development platform), but in short, we realised it'd be quicker to redevelop in Unity3D than it would be to make the game we wanted to in XNA. Plus XNA seems to be a bottomless swamp of "it might work if we're lucky" on the commercialisation front. This realisation probably would have been better a month ago, but them's the breaks.

So now that we're redeveloping, we're going to be taking a parallel approach to our implementation. What this means is that 'feature x' isn't really complete until it can be utilised by artists and level designers to put things in-game. The point here is that at any point, the designers and artists have access to play with the full power of the engine being developed by our programmers, and that we'll never be at that 'oh crap, now we've gotta make a level editor' stage again.

The downside to this approach is simply slower gameplay development, as everything will take that little bit longer. But with a good basic structure to your code, I'm fairly certain that this can be minimised. It also will ensure that all developers will know how the level editor, game world and other tools work, simply because they helped make them all (which is very SCRUMptious, if nothing else).

A parallel approach definitely works with development frameworks like Unity, where creating both sides won't slow down our development all that much. If we were still using XNA, I feel there might have been too much work before we had working code to do a parallel implementation in the same way.

So, fellow developers, I'd like your opinions on this subject: do you implement your tools and game in parallel, sequentially or in some strange hybrid approach? And, of course, why do you choose to do this?
