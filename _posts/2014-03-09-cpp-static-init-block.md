---
layout: post
title: Emulating the static initialization blocks of Java in C++
author: Tamás Szelei
github_link: https://github.com/sztomi/cpp-static-init-block
slug: cpp-static-init-block
tags: c++ java
disqus_page_id: szeleime/emulating_the_static_initialization_blocks_of_java_in_c_28
---

## What is a static initialization block?

In Java, there is a language construct called a static initialization block. The static initialization block will be called the first time the class is loaded by the Java runtime. For example, consider the following code snippet:

```java
class Foo {
    static {
        // initialization code goes here
        // called only once, when the class is loaded by the runtime
        System.out.println("I'm the static initialization block of Foo\n");
    }

    public Foo() {
        System.out.println("I'm the constructor of Foo\n");
    }

    public static void Main(String[] args) {
        Foo foo1 = new Foo();
        Foo foo2 = new Foo();
    }
}
```

This produces the output:

```
I'm the static initialization block of Foo
I'm the constructor of Foo
I'm the constructor of Foo
```

This construct can be useful in a variety of situations. In Java, the intended use case is to allow multiline initialization of static members of a class. It can also be used for logging and any kind of “registration” or “subscription” code (such as for [script binding](/code-generator)).

C++ lacks this construct, but with some clever use of the language it’s possible to mimic certain aspects of it.

-----

## What can be emulated?

First of all, there is no such thing as a runtime in C++, at least not in the Java sense. This implies that the above definition can’t be replicated exactly in C++. Thus, the goal is to have a construct which

  * Uses minimal boilerplate[^1]
  * Is easy to understand (that is, the syntax is straightforward)
  * Acts inside the scope of the class, as a static function
  * Executes code at a deterministic point, preferably at the start of main

## The syntax

From the above requirements (and some restrictions to be mentioned), the following is the intended syntax for the static initialization block:

In foo.h:

```cpp
#pragma once
#include "static_init.h"

class Foo
{
public:
    Foo();
    DECLARE_STATIC_INIT(Foo);
};
```

In foo.cc:

```cpp
#include <iostream>
#include "foo.h"

Foo::Foo()
{
    std::cout << "I'm the constructor of Foon";
}

STATIC_INIT(Foo)
{
    std::cout << "I'm the static initialization block of Foon";
}
```

In main.cc:

```cpp
#include <iostream>
#include "static_init.h"
#include "foo.h"

int main()
{
    static_init::execute();
    Foo foo1, foo2;
}
```

This code is expected to produce the same output as the Java snippet above.

## Implementation

So what goes into `static_init.h`? From the code in main, it’s not hard to guess that one part of the implementation is some sort of registry. This is true, and it looks like this:

```cpp
typedef void (*init_func_type)();

class static_init
{
public:
    static static_init& instance()
    {
        static static_init inst;
        return inst;
    }

    void add_init_func(init_func_type f) { funcs_.push_back(f); }

    static void execute()
    {
        auto& inst = instance();
        for (auto& c : inst.funcs_) c();
    }

private:
    static_init() {}

    std::vector<init_func_type> funcs_;
};
```

`static_init` is a singleton that manages and executes void functions. `init_func_type` is a typedef for a function pointer that points to a function that takes no parameters. They will be used to point to static member functions. `std::function` would also work here, but would be less efficient. The execute member function is static merely for syntactic niceness on the calling side, nothing else.

Where is `add_init_func` called? The trick is to call it in a constructor of a static member. This constructor takes the init function as a parameter and passes it to `add_init_func`. Theoretically, it would be possible to call that function right there (and eliminate the need for the “init function registry”), but doing so would make our code affected by the [“static initialization order fiasco”](http://www.parashift.com/c++-faq/static-init-order.html). We don’t want to impose any restrictions on the clients of our library, so we are taking this approach[^2].

For the static member where we sneak in the registration code, we need to define a helper class. This is rather simple:

```cpp
class static_init_helper
{
public:
   static_init_helper(init_func_type f)
   {
       static_init::instance().add_init_func(f);
   }
};
```

At this point we have everything we need for the functionality. Foo.h would have code like:

```cpp
#pragma once
#include "static_init.h"

class Foo
{
public:
    Foo();
    static void static_init_func();
    static static_init_helper Foo_static_init_helper;
};
```

And in foo.cc:

```cpp
#include <iostream>
#include "foo.h"

Foo::Foo()
{
    std::cout << "I'm the constructor of Foon";
}

// This is where the registration code (i.e. the constructor of the helper class) gets called:
static_init_helper Foo::Foo_static_init_helper(&Foo::static_init_func);

// And this is the implementation of the static init function,
// an actual static member function of the class.
void Foo::static_init_func()
{
    std::cout << "I'm the static initialization block of Foon";
}
```

It works, but not pretty.

## Making it a bit prettier

I intentionally arranged the above code in a way that makes it easy to see what can be repeated by a macro. The declaration part is very straightforward:

```cpp
#define DECLARE_STATIC_INIT(ClassName)
   static void static_init_func();
   static static_init_helper ClassName##_static_init_helper
```

Note the lack of semi-colon at the end. This is merely a personal preference, it could be added. Personally I like if my macros look and feel like statements, and this helps with that.

Similarly, the implementation part:

```cpp
#define STATIC_INIT(ClassName)
   static_init_helper ClassName::ClassName##_static_init_helper(&ClassName::static_init_func);
   void ClassName::static_init_func()
```

But, here you may not add a semi-colon at the end, since the macro ends with the signature of the member function that’s about to be written. This is what allows the macro to act like a part of a function definition.

## Shortcomings

One problem was already mentioned above: while the static init functions are not directly affected by the “static initialization order fiasco” (i.e. they can expect static members of any class to be fully constructed), they may not depend on each other, because the order they will be called is not defined.

This solution introduces a somewhat alien concept into the land of C++. That implies an increased overhead for programmers reading the code that uses it. Still, with the right naming the intention of this code should be easy to guess.

Also, this adds a data member to the class. While this data member is 0 sized, it still needs to exist in a source file to be linked correctly. This means that the static init function can’t be inline-only.5

## Source code

The source code for this article (along with some example code) is available in the [Github repository](https://github.com/sztomi/cpp-static-init-block).

