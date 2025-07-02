# AUDL IDE

> Currently in Alpha

AUDL allows you to write Vue in a new way;

```
H3#header("Here's some text!")

div.contentView {
  H2("More text.")

  Grid {
    Card.spaced {
      H2("Welcome to my website!")  
    }  

    H-Stack {
      a[href="/apps"] {
        Button {
          P("Apps")  
        }  
      }  
    }
  }

  Navbar
}
```

Becomes:

```vue
<template>
<h3 id="header">
  Here's some text!
</h3>
<div class="contentView">
  <h2>
    More text.
  </h2>
  <grid>
    <card class="spaced">
      <h2>
        Welcome to my website!
      </h2>
    </card>
    <h-stack>
      <a href="/apps">
        <button>
          <p>
            Apps
          </p>
        </button>
      </a>
    </h-stack>
  </grid>
  <navbar />
</div>
</template>
```

Note: the experience is horrible and this is the worst IDE I've ever used.
