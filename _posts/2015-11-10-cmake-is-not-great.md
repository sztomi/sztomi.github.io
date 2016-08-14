---
layout: post
title: cmake is not great, but it doesn’t matter
author: Tamás Szelei
github_link:
slug: cmake-is-not-great
tags: c++ cmake
disqus_page_id: szeleime/cmake_is_not_great_but_it_doesn8217t_matter
---

[CMake](http://cmake.org), *the language* is not great. It is just not a pleasant tool to work with. Not at all; it feels like it was not designed as a *language*, but a mere *configuration file* that sets build options in a compiler-agnostic way. But, it hits many important bullet points for building software and most importantly: “just works”. As a result, it has gained popularity over the years because cmake, the software is quite good.

As it happens often, control structures began to creep into the configuration file. This little if won’t hurt anyone, and look, I can do conditional steps during the build file generation with it! How about a for loop? We don’t even have to add an array type, we can just treat strings as arrays! Regex? Sure, add some [Cthulhu curse](http://stackoverflow.com/a/1732454/140367) while you are at it. And so on.

-----

And *still*, despite being a pretty bad patchwork of a language (certainly worse than PHP for that matter), cmake is slowly but surely becoming the de-facto standard build system for C++ projects. Even Boost is [replacing bjam with cmake](http://rrsd.com/blincubator.com/tools_cmak/). Why is this happening?

## You may curse a little but it will work

Squeezing out all the special build steps your application requires from cmake is often challenging in a platform-agnostic way. However, today cmake is so mature and so widely adopted that there is a good chance you can find a semi-easy solution to virtually anything; if that fails, you bury yourself in the documentation and after you consumed enough coffee, you come out victorious. If nothing else, you provide compiler and/or platform-specific steps which is somewhat backwards, but from a pragmatic point of view, as good as a prettier solution. Once you have that sorted out, your build just works and only requires incremental changes.

On that note, I also want to mention [cmakepp](https://github.com/toeb/cmakepp), a truly wonderful project that aims to make the language a bit more usable. It adds return values, better operators, exceptions and countless other useful features, all implemented in native cmake (in other words, no extra dependency). If you are pulling your hair over cmake non-sense, you might want to give it a go.

## We love to feel at home

When your users check out your library, they don’t want to read a guide on how to build it. They will certainly read and follow the manual if they have to, but most of the time, they just want a build process that is the same as for any other program, a “one click build” of sorts.

![Screenshot of a project using CMake on
Github](/public/img/cmake-is-not-great/cppreact_screenshot.png)

They don’t want to find out which script to call (bootstrap.sh? configure.sh? build.sh? what if more than one is present?), install weird python modules or have a very specific minor release of autotools just to be able to build.  CMake “feels like home”. Your users can, most of time, just look at the source tree, realize that it uses cmake and do an out-of-source build from muscle memory. If there is a missing dependency, CMake will let them know in a very civillised (to the point) error message. The wider the adoption, the more this becomes natural and desired.

CMake is becoming the lingua franca of builds, and we, users, want a lingua franca badly. Any lingua franca, if not unusably complicated will do (autotools, for example failed that point).

As a side note, a huge percentage of the popularity of Github probably comes from this desire. Github encourages a specific “feel” for projects and this not only benefits the site brand, but also the users; the barrier of entry for any project on Github is lower when they look and feel the same.

## Ticket to ride

cmake also provides an interface for tooling that nothing else really does. IDEs can gather information about the structure of a project; powerful source code analysis tools from the clang extras can get the compilation flags from the compilation databases. cmake became a sort of portable project format, too: [QtCreator](http://www.qt.io/ide), [CLion](https://www.jetbrains.com/clion/#cmakeSupport), [KDevelop](https://www.kdevelop.org) and probably many others support it[^1]. All in all, using CMake already opens the door to many important development tools.

## Why it doesn’t matter

Joel Spolsky writes in the Duct Tape Programmer:

<p class="message">
Jamie Zawinski is what I would call a duct-tape programmer. And I say that with a great deal of respect. He is the kind of programmer who is hard at work building the future, and making useful things so that people can do stuff. He is the guy you want on your team building go-carts, because he has two favorite tools: duct tape and WD-40. And he will wield them elegantly even as your go-cart is careening down the hill at a mile a minute. This will happen while other programmers are still at the starting line arguing over whether to use titanium or some kind of space-age composite material that Boeing is using in the 787 Dreamliner.

When you are done, you might have a messy go-cart, but it’ll sure as hell fly.
</p>

CMake is good enough for what it does and it’s a tool that ships your software. That is what matters.

[^1]: “Support” here means that they can interact directly with the cmake file and don’t require a generated IDE-specific project files.
