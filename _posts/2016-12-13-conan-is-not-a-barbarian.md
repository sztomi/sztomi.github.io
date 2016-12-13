---
layout: post
title: Conan is not a barbarian
author: Tamás Szelei
github_link:
slug: conan
tags: ['c++', 'conan']
---

After reporting an issue on the [siplasplas](https://github.com/Manu343726/siplasplas) issue tracker, I came accross [conan](http://conan.io) again there, because siplasplas is actively moving it dependency handling to it. 

I was well aware of conan's existence, but I haven't used it and I was a bit sceptical after biicode died. Nevertheless, I decided to take look again and now I'm convinced that there is subtantial value in using conan. In this post I'm going to summarize my experiences with it.

## These *are* the dependencies you are looking for

Conan offers an easy solution to installing the right dependencies, possibly
along with builds while also allowing rebuilding everything. In the most basic
form this is accomplished by maintaining a `conanfile.txt` that lists the
packages to install. 

### Integrations

Conan is not a build system itself. C++ projects have a huge diversity in build
solutions (for the better or worse). Conan respects this and offers
integrations for some build systems. What does an integration do? It allows
utilizing the downloaded packages easily in your build. For example, the cmake
integration sets the include and library paths and provides variables from the
packages. 

On top of that, conan also generates easily parsable txt files, so you can get
away with minimal scripting if you use a build system not yet supported by
conan.

## Packages on conan.io

While conan can be self-hosted, many projects will be interested in just using
the official conan.io repository. Currently, there is a fair number of packages, but
it's easy to run into ones that are not available. I think this will change
soon as more and more people are starting to use it.

## They said I can be anything - so I became a package

However, it's quite easy to create packages from git repos, and for whatever
reason I found it also quite satisfying. There is something about "making it
click". So don't be discouraged if you can't find your favorite package, spend
those 10 minutes on learning how to create one.

## Sign me a river

And here is my one issue with conan that I think needs to be resolved before it
can really become mainstream. Package signing. Currently, if you want to be
sure that you are not integrating malicious code into your builds, you will
need to

  * Check the origins of each and every single package source
  * If it's a github fork, you need to track down if they made any changes to
    the upstream version
  * If they did, you need to make sure that they are benign
  * And rebuild everything from source

That is a lot of friction, to be honest. It would be great if I could import
GPG keys of users that I trust, similarly to how I trust maintainers of a linux
package manager. This would also help choosing the right package when there is
a number of different ones are available for a dependency.

## Go, try it

Reading back what I just wrote, this almost sounds like an ad for conan. 
I assure you, it's not, I'm just really excited for this project. Creating 
packages is so easy, and with JFrog backing I'm hoping for a bright future in
C++ dependency management. Go, try it.

