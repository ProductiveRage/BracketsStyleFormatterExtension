# Format LESS StyleSheet (nm|tU)

This is an [Adobe Brackets](http://brackets.io) extension to format LESS files in a clean and concise way. It only operates on files with a .less extension and it assumes that the content is valid. If invalid content is encountered then it will format the content up to that point, insert some line returns and then include what's left unaltered, along with a warning in a bottom panel indicating the line at which the invalid content now starts.

The target format is simple (and not currently customisable). Opening braces are hanging, indentation happens within style or media query sections with four spaces per indentation level, all consecutive properties appear without blank lines between them but blank lines will appear between all blocks of rules and nested selectors / media queries and between any consecutive nested selectors / media queries. Any nested selectors / media queries that only contain a single property will be reduced to a single line. Any nested selectors that may be flattened without affecting their meaning, will be. Any empty selectors or media queries (those that don't contain any content) are removed. For example:

    div.MyControl
    {
        div.Content
        {
            border: 1px solid black;

            background: white;

            h2
            {
                font-size: 20px;
            }

            p
            {
                line-height: 1.8em;
                font-size: 14px;

                span.Notes
                {
                }
            }
        }
    }

becomes

    div.MyControl div.Content {
        border: 1px solid black;
        background: white;

        h2 { font-size: 20px; }

        p {
            line-height: 1.8em;
            font-size: 14px;
        }
    }

with a single stroke of [Ctrl]-[Alt]-[F]!

(Or via the "Format LESS StyleSheet (nm|tU)" command in the Edit menu if you'd prefer).

There are a range of special conditions to try to deal with comments in the least-surprising way. "Same line" comments will remain on the same line as the content they were found with. Comments before nested selectors or media queries will appear directly before the nested content and after any blank line before the nested content. Selectors or media queries containing comments are not considered empty (even if they don't contain any rules or nested content). To illustrate:

    div.MyControl
    {
        div.Content
        {
            border: 1px solid black; // This is a "same line" comment
            // border-radius: 4px; <- This is not a "same line comment"
            background: white url("awesome-cats.png") /* url("awesome-dogs.png") */ top left no-repeat; // Another same-liner

            // Header style..
            h2
            {
                font-size: 20px;
            }

            p
            {
                line-height: 1.8em;
                font-size: 14px;

                span.Notes
                {
                    // font-style: italic;
                }
            }
        }
    }

becomes

    div.MyControl div.Content {
        border: 1px solid black; // This is a "same line" comment
        // border-radius: 4px; <- This is not a "same line comment"
        background: white url("awesome-cats.png") /* url("awesome-dogs.png") */ top left no-repeat; // Another same-liner

        // Header style..
        h2 { font-size: 20px; }

        p {
            line-height: 1.8em;
            font-size: 14px;

            span.Notes {
                // font-style: italic;
            }
        }
    }

I ran this across all of the stylesheets of a major website at work that had been stable for a few months and got a 17% reduction in total line count with, I believe, no reduction in readability. In fact, I think there's a good argument that applying this sort of standardisation of formatting *helps* readability in that there is less "personal taste" to get between what is written and what the intent was.

I actually took some inspiration from the idea of Go's "[fmt](http://blog.golang.org/go-fmt-your-code)" and was reminded again of the benefits while adhering to JsLint's rules when writing this. In fact, I'm just going to quote straight from that Go Blog Post about "fmt" -

* easier to write: never worry about minor formatting concerns while hacking away
* easier to read: when all code looks the same you need not mentally convert others' formatting style into something you can understand
* easier to maintain: mechanical changes to the source don't cause unrelated changes to the file's formatting; diffs show only the real changes
* uncontroversial: never have a debate about spacing or brace position ever again!

Note: Like the [CssParserJs](https://bitbucket.org/DanRoberts/cssparserjs) code, this was ported from C# code I wrote a few months ago and then sort of coerced into a JavaScript-like arrangement, so there may be some slight oddities. But the entire "StyleRewriter.js" file (which does the real work, with the help of [CssParserJs](https://bitbucket.org/DanRoberts/cssparserjs)) is less than 500 lines of quite thoroughly-described code so there's hopefully nothig *too* WTF-worthy!