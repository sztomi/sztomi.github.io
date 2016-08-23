---
layout: post
title: "Introducing rpclib"
author: Tamás Szelei
github_link: https://github.com/rpclib/rpclib
slug: introducing-rpclib
tags: c++ rpclib projects
---

The 361st commit in the [rpclib repository](https://github.com/rpclib/rpclib) marks the first public release of [rpclib](http://rpclib.net), the project I've been working for the last ~11 months (294 days, to be exact). What started off as *"throw this together in a month and then move on to the next thing"* became a crazy journey of perfectionism and *"I'll add this tiny feature before release because what would people think if it's not there"*. Breaking and reworking things just for the sake of it. That's a great way to have a side project to *work on*, but not a great way to *finish it*.

I realized this about a month and a half ago and since then, I've been working towards a complete
state that I can release. Right now I'm minutes away from pushing the button to upload the
**1.0.0-preview1** release. I decided to create a preview before the actual release, because at this point feedback is pretty important.

-----

## What is rpclib?

In short, `rpclib` is a modern msgpack-rpc library for C++. It grew out of the frustration over the
boilerplate or external tooling that many RPC solutions require. Its syntax was inspired by
Boost.Python and luabind. I wanted something that would have minimal setup code and a similar
"binding" logic as those libraries. `rpclib` does not operate with "services", it does the
bare-bones of RPC: exposing a function for remote calling.

So this is the syntax of the server:

```cpp
#include <iostream>
#include "rpc/server.h"

void foo() {
    std::cout << "foo was called!" << std::endl;
}

int main(int argc, char *argv[]) {
    // Creating a server that listens on port 8080
    rpc::server srv(8080);

    // Binding the name "foo" to free function foo.
    // note: the signature is automatically captured
    srv.bind("foo", &foo);

    // Binding a lambda function to the name "add".
    srv.bind("add", [](int a, int b) {
        return a + b;
    });

    // Run the server loop.
    srv.run();

    return 0;
}
```

The client is implemented in the same spirit. Only the most basic "setup" code is there and the
rest is your applicaton logic (i.e. calling functions):

```cpp
#include <iostream>
#include "rpc/client.h"

int main() {
    // Creating a client that connects to the localhost on port 8080
    rpc::client client("127.0.0.1", 8080);

    // Calling a function with paramters and converting the result to int
    auto result = client.call("add", 2, 3).as<int>();
    std::cout << "The result is: " << result << std::endl;
    return 0;
}
```

## Where to get it

You can find the project on github: [rpclib](https://github.com/rpclib/rpclib). The documentation
is on [rpclib.net](http://rpclib.net). If you have any questions, gitter is here: [rpclib gitter](https://gitter.im/rpclib/Lobby). All feedback is welcome!
