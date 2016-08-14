---
layout: post
title: Implementing a code generator with libclang
author: Tamás Szelei
github_link: https://github.com/sztomi/code-generator
slug: code-generator
tags: c++ clang python code-generation
disqus_page_id: szeleime/implementing_a_code_generator_for_c_with_libclang
---

The following article covers the process of implementing a practical code generator for C++ in detail. You can find the full source code for the article [on GitHub](https://github.com/sztomi/code-generator).

A code generator is a very useful asset in a larger C++ project. Due to the lack of introspection in the language, implementing the likes of reflection, script binding and serialization requires writing some sort of boilerplate that essentially keeps the data which is otherwise thrown away by the compiler. These solutions are either intrusive (heavily macro-based, thus hard to debug and require weird syntax in declarations) or fragile (the boilerplate must be constantly updated to follow the actual code, and might break without warning). One way to improve the robustness is to automate writing this boilerplate. In order to achieve this, we need to parse the code somehow, in other words, understand what information to keep. However, parsing C++ is an extremely complex task, and with the copious amount of weird corner cases, we are in for quite a ride if we attempt to do so.

-----

Attempts to parse a “good enough” subset of C++ generally fail or require the project to follow strict coding guidelines. That is, to avoid syntax that the parser can’t understand – and may break at any time when someone commits code that doesn’t follow these guidelines. The excellent [LLVM](http://llvm.org) project offers a tool to amend this problem: [libclang](http://clang.llvm.org/docs/Tooling.html#libclang)[^1]. Since libclang ultimately calls the same bits of code that the clang C++ frontend calls, it will understand everything that is valid C++. Recent builds even support C++1y (C++14, if all goes well) features. It has one little flaw: the [official documentation](http://clang.llvm.org/doxygen/group__CINDEX.html) is pretty much only the Doxygen-generated reference, which is very useful, but not as an introduction to the usage of the library; due to the complex nature of the problem, it has a steep learning curve.

I am going to present the process of implementing a practical code generator for C++ using libclang and its Python bindings. “Practical” in the sense that it is not a general solution. What I’m presenting here is not meant to be taken as the concrete implementation I made but rather as one possible way of solving a problem, a detailed example. Using these ideas, it is possible to create an all-encompassing reflection solution or to generate code for existing libraries of any purpose. The aim is to write natural C++ syntax with minimal intrusive bits to provide the functionality. I encourage readers to experiment with the code and to try and implement a code generator from scratch.

I can’t go on without mentioning [Eli Bendersky’s excellent post on the topic](http://eli.thegreenplace.net/2011/07/03/parsing-c-in-python-with-clang), which served as a great resource when I started gathering information.

## Prerequisites

To understand everything in this article, I recommend that the reader knows:

  * Intermediate C++
  * Intermediate Python
  * What serialization and reflection is
  * What an AST (Abstract Syntax Tree) is

Required tools:

  * Python 2.7 (3.x will probably also work apart from little things)
  * LLVM 3.2+
  * libclang python bindings (I recommend installing with pip: `pip install clang`)
  * A text editor or IDE (mostly for editing Python code)

## The example problem

In our example, we are implementing automatic script binding, so we don’t need to write and maintain binding code by hand. We also want to be able to omit certain parts of the source so that they are not taken into account when the binding boilerplate code is generated[^2]. Keep in mind that his article is not about automatic script binding[^3]. It is just one thing that can be done with code generation and used as an example here.

In the example, we are going to work with the following C++ class declaration:

```cpp
class TextComponent
{
public:
    TextComponent();

    std::string text() const;
    void setText(const std::string& value);

    void superSecretFunction();

private:
    std::string m_text;
};
```

## Adding scripting

Our goal is to be able to write the following in Python:

```python
t = CodegenExample.TextComponent()
t.setText("Hello")
print t.text()
t.superSecretFunction()
```

– with the expected output being:

```
Hello
Traceback (most recent call last):
  File "src/test.py", line 7, in
    t.superSecretFunction()
AttributeError: 'TextComponent' object has no attribute 'superSecretFunction'
```

Now let’s see the simple solution. We will utilize [Boost.Python](http://www.boost.org/doc/libs/1_55_0/libs/python/doc), a seasoned and battle-tried library, which allows us to write binding code in a very expressive manner. The following is the entire binding code in a separate source file which we will link with our executable. We also define an init_bindings() function, which does what its name says.

```cpp
#include <boost/python.hpp>
#include "textcomponent.h"

using namespace boost::python;

BOOST_PYTHON_MODULE(CodegenExample)
{
    class_<TextComponent>("TextComponent")
        .def("text", &TextComponent::text)
        .def("setText", &TextComponent::setText)
    ;
}

void init_bindings()
{
    Py_Initialize();
    initCodegenExample();
}
```

After `init_bindings` is called, our `TextComponent` class is available to use in Python. The above code expresses exactly what we wanted to achieve: one constructor, and two member functions. We simply don’t bind the `superSecretFunction`, because we don’t want that to be available from Python.

All of the above is what we would do in a typical project to make a class scriptable. Our aim is to generate this code automatically.

## Automation

###Traversing the AST

Now we are going to inspect the abstract syntax tree (AST) of the header file and use that information to generate the above binding code.

Traversing the AST is performed with cursors. A cursor points to a node in the AST, and can tell what kind of node that is (for example, a class declaration) and what are its children (e.g. the members of the class), as well as numerous other information. The first cursor you need points to the root of the translation unit, that is, the file you are parsing.

To obtain this cursor, we need to do the following in Python:

```python
clang.cindex.Config.set_library_file('/usr/local/lib/libclang.so')
index = clang.cindex.Index.create()
translation_unit = index.parse(sys.argv[1], ['-x', 'c++', '-std=c++11', '-D__CODE_GENERATOR__'])
```

The index object is our main interface to libclang, this is where we normally initiate “talking to the library”.

### The parameters of the `parse` call

The parse function takes a filename and a list of compiler flags. We need to specify that we are compiling a C++ header (-x c++), because otherwise libclang will assume it is C, based on the .h extension (and consequently produce an AST that misses most parts of our header file). This option will cause libclang to preprocess our file (resolve macros and includes) and then treat it as a C++ source. The other options should be self-explanatory: setting the standard we use in the parsed source, and providing the `__CODE_GENERATOR__` macro definition which will come handy in most implementations. Now, back to processing the AST – recursively. The AST of the TextComponent class can be dumped like this (see [dump_ast.py](https://github.com/sztomi/code-generator/blob/master/src/dump_ast.py)):

```
TRANSLATION_UNIT textcomponent.h
  +--CLASS_DECL TextComponent
     +--CXX_ACCESS_SPEC_DECL
     +--CONSTRUCTOR TextComponent
     +--CXX_METHOD text
     |  +--NAMESPACE_REF std
     |  +--TYPE_REF string
     +--CXX_METHOD setText
     |  +--PARM_DECL value
     |     +--NAMESPACE_REF std
     |     +--TYPE_REF string
     +--CXX_ACCESS_SPEC_DECL
     +--CXX_METHOD superSecretFunction
     +--CXX_ACCESS_SPEC_DECL
     +--FIELD_DECL m_text
        +--NAMESPACE_REF std
        +--TYPE_REF string
```

Comparing this syntax tree dump to the source above should help with understanding what libclang does when parsing the source code.

### Did you mean recursion?

The libclang C API has a visitor-based way of traversing the AST. This is also available from the Python bindings via the function clang.cindex.Cursor_visit, but we are going to utilize the more Pythonic, iterator-based approach, which is an addition of the Python bindings. The ‘T’ stands for tree in the abbreviation, and the most straightforward way to process such a data structure is to recursively traverse it. It is pretty simple:

```python
def traverse(cursor):
    # ...
    # do something with the current node here, i.e.
    # check the kind, spelling, displayname and act based on those
    # ...
    for child_node in node.get_children():
        traverse(child_node)
```

### Useful properties of cursors

Cursors provide a rich set of information about each node in the AST. For our purposes, we will use the following:

  * `kind`: The kind of node we are looking at in the AST. Answers questions like: Is this a class declaration? Is this a function declaration? Is this a parameter declaration?
  * `spelling`: The literal text defining the token. For example, if the cursor points to a function declaration void foo(int x);, the spelling of this cursor will be foo.
  * `displayname`: Similar to spelling, but the displayname also contains some extra information which helps to distinguish between identically spelled tokens, such as function overloads. The displayname of the above example will be foo(int).
  * `location.file`: The source location where the node was found. This can be used to filter out included contents from the source file being parsed, because usually we are interested in that.

If you are implementing something different, you might find the following properties useful, too: location,extent. Sometimes the only way to get a particular string is to read the source directly. With location and extent you can find the exact point in the file that you need to read.

### Poor man’s code model

While it is entirely possible to generate code in an [online manner](http://en.wikipedia.org/wiki/Online_algorithm), I find it clearer (and more reusable) to actually build a code model in which the C++ classes, functions (and whatever else is interesting for your purposes) are objects.

The following piece of code illustrates what I mean here and also showcases how a (very thin) object model of a class is constructed:

```python
class Function(object):
    def __init__(self, cursor):
        self.name = cursor.spelling

class Class(object):
    def __init__(self, cursor):
        self.name = cursor.spelling
        self.functions = []

        for c in cursor.get_children():
            if (c.kind == clang.cindex.CursorKind.CXX_METHOD):
                f = Function(c)
                self.functions.append(f)
```

It all really boils down to traversing a tree and filtering for certain elements. The for loop above does just that: if the current node is a C++ method (member function), then construct and store a Function object using the information found in that node.

This is a very simplistic code model: classes have names and member functions, and member functions have names. It is possible to gather much more than that, but for our purposes, this is mostly enough. By the way, that above is almost half of all the code we need in our code generator!

Now let’s see the other half: how the classes are built. Reusing the traversal approach:

```cpp
def build_classes(cursor):
    result = []
    for c in cursor.get_children():
        if (c.kind == clang.cindex.CursorKind.CLASS_DECL
            and c.location.file.name == sys.argv[1]):
            a_class = Class(c)
            result.append(a_class)
        elif c.kind == clang.cindex.CursorKind.NAMESPACE:
            child_classes = build_classes(c)
            result.extend(child_classes)

    return result
```

One important step here is that we are checking the location of the node. This ensures that we are only taking the contents of the file being parsed into account. Otherwise, we would end up with a huge mess of an AST due to the includes being , well, included. To put it all together, we would call the above function with the translation unit cursor (see above), to find all classes and their functions in the source file:

```python
classes = build_classes(translation_unit.cursor)
```

## Code generation

Now that we have a code model, we can easily process it and generate the code we need. We could iterate over the list of classes, print the class_… part in the binding code, then iterate their member functions… etc. This approach can work and is easy to implement, albeit not very elegant. We are going to do something way cooler: we will use templates to generate our code.

### Templates. Duh?

Of course you already saw we are using templates in the Boost.Python code. What is so cool about that? Oh, I didn’t mean C++ templates. Generating text from data is a well-understood problem, with lots of great solutions from the web programming world. [Mako templates](http://www.makotemplates.org) is one of them[^4], with prominent users like reddit and python.org. Sceptical? Take a look at the template code we will use:

```cpp
#include <boost/python.hpp>
#include "${include_file}"

using namespace boost::python;

BOOST_PYTHON_MODULE(${module_name})
{
% for c in classes:
    class_<${c.name}>("${c.name}")
    % for f in c.functions:
        .def("${f.name}", &${c.name}::${f.name})
    % endfor
    ;
% endfor
}

void init_bindings()
{
    Py_Initialize();
    init${module_name}();
}
```

This template directly uses the code model we defined above, c.name refers to the name of the Class object. It is easy to see how even this simple code model can be used to generate code for various purposes. You can register functions not only for script binding, but also reflection libraries which allow a huge variety of dynamic uses (serialization, RPC, thin layer for script binding etc.). Save that template to a file named bind.mako, and then using it is really just a few lines:

```python
from mako.template import Template
classes = build_classes(translation_unit.cursor)
tpl = Template(filename='bind.mako')
print tpl.render(
                classes=classes,
                module_name='CodegenExample',
                include_file=sys.argv[1]))
```

If we process **textcomponent.h** with our full script, this is what we get as output:

```
$ ./boost_python_gen.py textcomponent.h

#include <boost/python.hpp>
#include "textcomponent.h"

using namespace boost::python;

BOOST_PYTHON_MODULE(CodegenExample)
{
    class_<TextComponent>("TextComponent")
        .def("text", &text)
        .def("setText", &setText)
        .def("superSecretFunction", &superSecretFunction)  // oops, should not be generated!
    ;
}

void init_bindings()
{
    Py_Initialize();
    initCodegenExample();
}
```

That is almost what we wanted. The remaining problem is that our script also bound the `superSecretFunction`, which we meant to hide.

### Hiding member functions

Now, to tell our code generator script that some parts of the AST are different than others (namely, we want to ignore them), we need to use some annotation magic[^5]. When I was experimenting, I tried using the new(-ish) C++11 [[attributes]] to mark functions, but libclang seemed to omit unknown attributes from the AST. That is correct behavior, as far as the standard is concerned: compilers should ignore unknown (non-standard) attributes. Clang simply chooses to ignore them while building the AST, which is unfortunate for our case. Luckily, clang has a language extension which can be used to apply string attributes to many kinds of nodes, and that information is readily available in the AST. With a graceful macro definition, we can use this extension without losing compatibility with other compilers. The syntax is the following:

```cpp
__attribute__((annotate("something"))) void foo(int x);
```

Admittedly, that is a bit lengthy. We do need to employ conditional compilation for portability anyway, so let’s do the following:

```cpp
#ifdef __CODE_GENERATOR__
#define HIDDEN __attribute__((annotate("hidden")))
#else
#define HIDDEN
#endif
```

This way our code generator will see the annotations, but compilers won’t. To use the annotation, we will need to revisit some of the code above. First, we write the annotation where we want it in the source:

```cpp
#pragma once

#include <string>

#ifdef __CODE_GENERATOR__
#define HIDDEN __attribute__((annotate("hidden")))
#else
#define HIDDEN
#endif

class TextComponent
{
public:
    TextComponent();

    std::string text() const;
    void setText(const std::string& value);

    HIDDEN void superSecretFunction();

private:
    std::string m_text;
};
```

The AST produced from the above source:

```
TRANSLATION_UNIT textcomponent.h
  +--CLASS_DECL TextComponent
     +--CXX_ACCESS_SPEC_DECL
     +--CONSTRUCTOR TextComponent
     +--CXX_METHOD text
     |  +--NAMESPACE_REF std
     |  +--TYPE_REF string
     +--CXX_METHOD setText
     |  +--PARM_DECL value
     |     +--NAMESPACE_REF std
     |     +--TYPE_REF string
     +--CXX_METHOD superSecretFunction
     |  +--ANNOTATE_ATTR hidden
     +--CXX_ACCESS_SPEC_DECL
     +--FIELD_DECL m_text
        +--NAMESPACE_REF std
        +--TYPE_REF string
```

As you can see, the annotations are added as children to the annotated nodes. A little change of our script is needed where we build the code model:

```python
def get_annotations(node):
    return [c.displayname for c in node.get_children()
            if c.kind == clang.cindex.CursorKind.ANNOTATE_ATTR]

class Function(object):
    def __init__(self, cursor):
        self.name = cursor.spelling
        self.annotations = get_annotations(cursor)

class Class(object):
    def __init__(self, cursor):
        self.name = cursor.spelling
        self.functions = []

        for c in cursor.get_children():
            if c.kind == clang.cindex.CursorKind.CXX_METHOD:
                f = Function(c)
                self.functions.append(f)
```

We can filter out the unwanted elements (classes from includes and functions that are meant to be hidden) in two places: during building the code model or when our mako template is rendered. Choosing either is a matter of taste, I voted for the latter (I feel it is better the keep the code model consistent with the source file). The modified template looks like this:

```cpp
#include <boost/python.hpp>
#include "textcomponent.h"

using namespace boost::python;

BOOST_PYTHON_MODULE(${module_name})
{
% for c in classes:
    % if "scripted" in c.annotations:
    class_<${c.name}>("${c.name}")
    % for f in c.functions:
        % if not "hidden" in f.annotations:
        .def("${f.name}", &${f.name})
        % endif
    % endfor
    ;
    % endif
% endfor
}

void init_bindings()
{
    Py_Initialize();
    init${module_name}();
}
```

At this point, the generated binding code is almost identical to what we wrote by hand. There is one last issue we need to cover.

## Hiding non-public members

Our example source only had public member functions. In a real-world scenario, this rarely happens. The code generator did not take *access specifiers* (public, private, protected) into account, but it would be very important to do so. The generated binding code would not compile if it would contain non-public members. Unfortunately, at the time this is written the Python bindings do not expose the access specifiers on the cursors. I recommend using [my patched cindex.py](https://gist.github.com/sztomi/9039902) to access this information[^6]. The last revision of our `Class` constructor filters out the non-public members:

```python
class Class(object):
    def __init__(self, cursor):
        self.name = cursor.spelling
        self.functions = []
        self.annotations = get_annotations(cursor)

        for c in cursor.get_children():
            if (c.kind == clang.cindex.CursorKind.CXX_METHOD and
                c.access_specifier == clang.cindex.AccessSpecifier.PUBLIC):
                f = Function(c)
                self.functions.append(f)
```

With this, our solution is pretty much complete. The generated source will look like the one we wrote by hand. You can find the full, integrated project in the [git repository](https://github.com/sztomi/code-generator).

[^1]: Another option to parse C++ header files is the [CppHeaderParser](https://pypi.python.org/pypi/CppHeaderParser/) Python package. It has some problems with templates and probably other syntax corner cases as well. The upside is that it is a single .py file, thus very easy to integrate in your project.

[^2]: Such a feature is useful when the C++ layer is meant to serve as a low level implementatation of features tied together by scripts. In some cases we want to keep functions public while hiding them from the scripting interface (e.g. debug functionality).

[^3]: There are plenty of great solutions for automatic script binding, far more versatile than what we implement here ([SWIG](http://www.swig.org) is one of them).

[^4]: There are several alternatives to Mako of course; if you are aiming to minimize the dependencies of your project, you might want to check out [Titen](https://code.google.com/p/titen/source/browse/titen.py). Another approach could be to avoid template engines overall and just use Python string formatting with `{variables_like_this}`.

[^5]: It is also possible to simply use the `__CODE_GENERATOR__` macro to hide some parts, but that is quite ugly and intrusive, one of the things we wanted to avoid.

[^6]: I submitted a patch to the clang frontend project during writing the article and I will update the post if it gets approved. UPDATE: the patch was merged some time ago.
