---
layout: post
title: Murmur3 hash as a constexpr function
author: Tamás Szelei
github_link: https://github.com/sztomi/constexpr_murmurhash
slug: constexpr-murmurhash
tags: c++ constexpr
---

C++14 [relaxed many restrictions](https://en.wikipedia.org/wiki/C%2B%2B14#Relaxed_constexpr_restrictions) on `constexpr` functions. The ability to contain branching, loops, switch statements makes them really easy to use. Implementing complicated functions at compile time is now a piece of cake.

To prove this point, I tried and implemented Murmur3A, the Murmur3 hash variant which is optimized for x86[^1] and computes 32 bit hash values. In this post I’m going to walk through the steps of the implementation.

-----

## constexpr is relaxed, but not entirely

Lots of constexpr restrictions are removed but there are still some remaining that prevent us from simply sticking constexpr in front of the [canonical implementation](https://web.archive.org/web/20160310090124/https://code.google.com/p/smhasher/source/browse/trunk/MurmurHash3.cpp). First and foremost, let us look at the “main part” of the original function:

```cpp
const uint32_t * blocks = (const uint32_t *)(data + nblocks*4);

for(int i = -nblocks; i; i++)
{
  uint32_t k1 = getblock32(blocks,i);

  k1 *= c1;
  k1 = ROTL32(k1,15);
  k1 *= c2;

  h1 ^= k1;
  h1 = ROTL32(h1,13);
  h1 = h1*5+0xe6546b64;
}
```

The first line contains a C-style cast, which will turn out to be a reinterpret_cast in the end. This is a problem, because reinterpret_casts are explicitly forbidden in constexpr functions. This is, strictly speaking, undefined behavior because a type-punned pointer is being dereferenced and the alignment of uint32_t is not guaranteed to be as this code assumes. Nevertheless, the code should work on its target platform (x86). This line being undefined behavior alone would kick us out of constexpr-world if the cast was not explicitly forbidden already. So how do we get around this?

## Shifting good, casting bad

As a side note, the following solution still relies on undefined behavior, but so does the original implementation.

### Getting the blocks

So, to get around the above limitation, I created a simple constexpr string_view class that can synthesize the 32-bit blocks from the compile-time string. This approach can be reused in similar scenarios, too.

{% highlight cpp %}
class str_view {
public:
  template<size_t N>
  constexpr str_view(const char(&a)[N])
      : p(a), sz(N - 1) {}

  constexpr char operator[](std::size_t n) const {
    return n < sz ? p[n] : throw std::out_of_range("");
  }

  constexpr uint32_t get_block(int idx) {
    int i = (block_size() + idx) * 4;
    uint32_t b0 = p[i];
    uint32_t b1 = p[i + 1];
    uint32_t b2 = p[i + 2];
    uint32_t b3 = p[i + 3];
    return (b3 << 24) | (b2 << 16) | (b1 << 8) | b0;
  }

  constexpr std::size_t size() const { return sz; }

  constexpr std::size_t block_size() const { return sz / 4; }

  constexpr char tail(const int n) const {
    int tail_size = sz % 4;
    return p[sz - tail_size + n];
  }

private:
  const char *p;
  std::size_t sz;
};
{% endhighlight %}

The get_block function takes four bytes of the string, shifts and puts them together. The blocks are returned in reverse order as that is how the algorithm uses them (i.e. the algorithm indexes starting with negative numbers up to zero).

### The tail

Murmur3 uses the remaining bytes in a specific way if the input length is not a multiple of 4:


{% highlight cpp %}
  const uint8_t * tail = (const uint8_t*)(data + nblocks*4);

  uint32_t k1 = 0;

  switch(len & 3)
  {
  case 3: k1 ^= tail[2] << 16;
  case 2: k1 ^= tail[1] << 8;
  case 1: k1 ^= tail[0];
          k1 *= c1; k1 = ROTL32(k1,15); k1 *= c2; h1 ^= k1;
  };
{% endhighlight %}

As you can see in the implementation of str_view, the tail bytes are computed similarly to the blocks.

The remaining modifications to the canonical implementation are trivial: I inlined the rotl32 calls and instead of an explicit length parameter I use the size function of str_view. I also changed the void* output parameter to uint32_t. So the full implementation looks like this:


{% highlight cpp %}
constexpr uint32_t mm3_x86_32(str_view key, uint32_t seed) {
  uint32_t h1 = seed;

  const uint32_t c1 = 0xcc9e2d51;
  const uint32_t c2 = 0x1b873593;

  const int nblocks = key.size() / 4;
  for (int i = -nblocks; i; i++) {
    uint32_t k1 = key.get_block(i);

    k1 *= c1;
    k1 = (k1 << 15) | (k1 >> (32 - 15));
    k1 *= c2;

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >> (32 - 13));
    h1 = h1 * 5 + 0xe6546b64;
  }

  uint32_t k1 = 0;
  char t = key.tail(0);

  switch (key.size() & 3) {
  case 3:
    k1 ^= key.tail(2) << 16;
  case 2:
    k1 ^= key.tail(1) << 8;
  case 1:
    k1 ^= key.tail(0);
    k1 *= c1;
    k1 = (k1 << 15) | (k1 >> (32 - 15));
    k1 *= c2;
    h1 ^= k1;
  };

  h1 ^= key.size();

  h1 ^= h1 >> 16;
  h1 *= 0x85ebca6b;
  h1 ^= h1 >> 13;
  h1 *= 0xc2b2ae35;
  h1 ^= h1 >> 16;

  return h1;
}
{% endhighlight %}

I originally experimented with indexing similarly to the blocks (and adding a number to get the nth tail byte), but that turned out to break the constexpr-ness – I’m not entirely sure if that was a compiler error or letting this compile is the one. Which brings us to two important questions.

## Is this really a compile-time constant?

Yes. The following code would not compile otherwise:

{% highlight cpp %}
using ce_mm3::mm3_x86_32;

template<int N>
struct printer
{
    printer() { std::cout << N << std::endl; }
};

printer<mm3_x86_32("Hello, world!", 0x9747b28c)> p;
{% endhighlight %}

## Is this code well-formed according to the standard?

To be honest, I’m not entirely sure. I am not using any reinterpret_casts which would be the main culprit in implementing hash functions that operate on blocks of data. The code does compile with both clang and gcc. Feel free to comment if you have any input on the issue.

## Getting the code

The entire source code and a couple of unit tests are available [on Github](https://github.com/sztomi/constexpr_murmurhash).

## MurmurHash in C++11 constexpr

I’ve gotten a trackback from [Ben Deane’s blog](https://web.archive.org/web/20160310090124/http://www.elbeno.com/blog/?p=1254) where he implements Murmur3 without the niceties of the C++14 rules.

[^1]: Not that this matters for constexpr; the point is, it computes the same values as that version of the algorithm does.
