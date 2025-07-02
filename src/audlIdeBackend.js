// AUDL to Vue compiler (embedded)
function tokenize(input) {
  const tokens = []
  let buffer = ''
  let inString = false

  for (const char of input) {
    if (char === '"') {
      buffer += char
      inString = !inString
    } else if (!inString && (char === '{' || char === '}' || char === '(' || char === ')' || char === ',' || char === '\n')) {
      if (buffer.trim()) tokens.push(buffer.trim())
      if (char.trim()) tokens.push(char)
      buffer = ''
    } else {
      buffer += char
    }
  }
  if (buffer.trim()) tokens.push(buffer.trim())
  return tokens.filter(t => t !== '')
}

function parseElementHeader(header) {
  const tagMatch = header.match(/^[a-zA-Z_][\w-]*/)
  if (!tagMatch) throw new Error(`Invalid tag in "${header}"`)

  const tag = tagMatch[0]
  const classes = []
  let id = null
  const props = {}

  let rest = header.slice(tag.length)

  const classIdRegex = /(\.[\w-]+|#[\w-]+)/g
  let match
  while ((match = classIdRegex.exec(rest)) !== null) {
    const val = match[0]
    if (val.startsWith('.')) classes.push(val.slice(1))
    else if (val.startsWith('#')) id = val.slice(1)
  }

  const propsRegex = /\[([^\]]+)]/g
  while ((match = propsRegex.exec(rest)) !== null) {
    const propString = match[1]
    const [key, val] = propString.split('=')
    if (key && val) {
      props[key.trim()] = val.trim().replace(/^"|"$/g, '')
    }
  }

  return { tag, classes, id, props }
}

function parseTokens(tokens) {
  let pos = 0

  function peek() {
    return tokens[pos]
  }
  function consume() {
    return tokens[pos++]
  }

  function parseElement() {
    const header = consume()

    if (header === 'For') return parseFor()

    const { tag, classes, id, props } = parseElementHeader(header)

    if (peek() === '(') {
      consume() // (
      const arg = consume()
      consume() // )
      return {
        type: 'element',
        tag,
        classes,
        id,
        props,
        children: [{ type: 'text', content: arg.slice(1, -1) }]
      }
    }

    if (peek() === '{') {
      consume() // {
      const children = []
      while (peek() !== '}') {
        if (peek() === 'For') children.push(parseFor())
        else children.push(parseElement())
      }
      consume() // }
      return {
        type: 'element',
        tag,
        classes,
        id,
        props,
        children
      }
    }

    return {
      type: 'element',
      tag,
      classes,
      id,
      props,
      children: []
    }
  }

  function parseFor() {
    consume() // For
    const variable = consume()
    consume() // in
    const iterable = consume()
    consume() // {
    const children = []
    while (peek() !== '}') {
      children.push(parseElement())
    }
    consume() // }
    return { type: 'for', variable, iterable, children }
  }

  const ast = []
  while (pos < tokens.length) {
    ast.push(parseElement())
  }
  return ast
}

function astToVueTemplate(ast, indent = 2) {
  const space = ' '.repeat(indent)

  function serialize(node, level) {
    if (node.type === 'text') {
      return `${space.repeat(level)}${node.content}`
    }

    if (node.type === 'for') {
      const iterable = node.iterable.replace('[]', '')
      const inner = node.children.map(c => serialize(c, level + 1)).join('\n')
      return `${space.repeat(level)}<template v-for="(${node.variable}, i) in ${iterable}" :key="i">\n${inner}\n${space.repeat(level)}</template>`
    }

    const tag = node.tag.toLowerCase()
    const classAttr = node.classes.length ? ` class="${node.classes.join(' ')}"` : ''
    const idAttr = node.id ? ` id="${node.id}"` : ''
    const propsAttr = Object.entries(node.props).map(([k, v]) => ` ${k}="${v}"`).join('')

    if (node.children.length === 0) return `${space.repeat(level)}<${tag}${classAttr}${idAttr}${propsAttr} />`

    const inner = node.children.map(c => serialize(c, level + 1)).join('\n')

    return `${space.repeat(level)}<${tag}${classAttr}${idAttr}${propsAttr}>\n${inner}\n${space.repeat(level)}</${tag}>`
  }

  return ast.map(node => serialize(node, 0)).join('\n')
}

function compileAUDLtoVue(audl) {
  try {
    const tokens = tokenize(audl)
    const ast = parseTokens(tokens)
    return `<template>\n${astToVueTemplate(ast)}\n</template>\n`
  } catch (error) {
    return `<!-- Error: ${error.message} -->`
  }
}

// IDE Backend
const audlInput = document.getElementById('audl')
const output = document.getElementById('output')
const autocompleteList = document.getElementById('autocomplete-list')

const AUDL_TAGS = [
  'V-Stack', 'H-Stack',
  'Card', 'Grid', 'Button',
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'For', 'a', 'div', 'span', 'img', 'ul', 'li'
]

function debounce(func, delay) {
  let timeout
  return function(...args) {
    const context = this
    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(context, args), delay)
  }
}

const updateOutput = debounce(() => {
  const val = audlInput.value
  const vueCode = compileAUDLtoVue(val)
  output.textContent = vueCode
}, 300)

// Enhanced key handling for {, (, ", Tab, and Shift+Tab
audlInput.addEventListener('keydown', e => {
  const start = audlInput.selectionStart
  const end = audlInput.selectionEnd
  const value = audlInput.value
  const before = value.slice(0, start)
  const after = value.slice(end)

  // Handle Tab and Shift+Tab for indentation
  if (e.key === 'Tab') {
    e.preventDefault()

    if (start === end) {
      // Single cursor position - just insert tab
      if (e.shiftKey) {
        // Shift+Tab: remove indentation from current line
        const lines = value.split('\n')
        const beforeLines = before.split('\n')
        const currentLineIndex = beforeLines.length - 1
        const currentLine = lines[currentLineIndex]

        if (currentLine.startsWith('  ')) {
          lines[currentLineIndex] = currentLine.slice(2)
          audlInput.value = lines.join('\n')
          audlInput.selectionStart = audlInput.selectionEnd = Math.max(0, start - 2)
        } else if (currentLine.startsWith(' ')) {
          lines[currentLineIndex] = currentLine.slice(1)
          audlInput.value = lines.join('\n')
          audlInput.selectionStart = audlInput.selectionEnd = Math.max(0, start - 1)
        }
      } else {
        // Regular Tab: insert 2 spaces
        audlInput.value = before + '  ' + after
        audlInput.selectionStart = audlInput.selectionEnd = start + 2
      }
    } else {
      // Multi-line selection - indent/unindent all selected lines
      const lines = value.split('\n')

      // Find which lines are selected
      const beforeLines = before.split('\n')
      const selectedText = value.slice(start, end)
      const selectedLines = selectedText.split('\n')

      const startLineIndex = beforeLines.length - 1
      const endLineIndex = startLineIndex + selectedLines.length - 1

      let indentChange = 0

      if (e.shiftKey) {
        // Shift+Tab: remove indentation
        for (let i = startLineIndex; i <= endLineIndex; i++) {
          if (lines[i].startsWith('  ')) {
            lines[i] = lines[i].slice(2)
            if (indentChange === 0) indentChange = -2
          } else if (lines[i].startsWith(' ')) {
            lines[i] = lines[i].slice(1)
            if (indentChange === 0) indentChange = -1
          }
        }
      } else {
        // Tab: add indentation
        for (let i = startLineIndex; i <= endLineIndex; i++) {
          lines[i] = '  ' + lines[i]
        }
        indentChange = 2
      }

      audlInput.value = lines.join('\n')

      // Maintain selection but adjust for indentation changes
      const newStart = Math.max(0, start + (e.shiftKey ? indentChange : 2))
      const newEnd = end + (indentChange * (endLineIndex - startLineIndex + 1))
      audlInput.selectionStart = newStart
      audlInput.selectionEnd = newEnd
    }
  }

  // Handle Enter key for auto-indent after {
  else if (e.key === 'Enter') {
    const lines = before.split('\n')
    const currentLine = lines[lines.length - 1]
    const indent = currentLine.match(/^(\s*)/)[1]

    // Check if the line ends with {
    if (currentLine.trim().endsWith('{')) {
      e.preventDefault()
      const newIndent = indent + '  '
      audlInput.value = before + '\n' + newIndent + after
      audlInput.selectionStart = audlInput.selectionEnd = start + 1 + newIndent.length
    }
  }

  else if (e.key === '{') {
    e.preventDefault()

    // Get current line and its indentation
    const lines = before.split('\n')
    const currentLine = lines[lines.length - 1]
    const indent = currentLine.match(/^(\s*)/)[1]

    const insert = '{\n' + indent + '  \n' + indent + '}'
    audlInput.value = before + insert + after

    // Position cursor on the indented line
    const cursorPos = start + 2 + indent.length
    audlInput.selectionStart = audlInput.selectionEnd = cursorPos
  }

  else if (e.key === '(') {
    e.preventDefault()
    audlInput.value = before + '()' + after
    audlInput.selectionStart = audlInput.selectionEnd = start + 1
  }

  else if (e.key === '"') {
    e.preventDefault()
    audlInput.value = before + '""' + after
    audlInput.selectionStart = audlInput.selectionEnd = start + 1
  }
})

// Enhanced autocomplete with keyboard navigation and cursor positioning
let selectedIndex = -1

function getCaretCoordinates(element, position) {
  // Create a mirror div to calculate caret position
  const mirror = document.createElement('div')
  const computed = getComputedStyle(element)

  // Copy styles
  const properties = [
    'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
    'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
    'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'
  ]

  properties.forEach(prop => {
    mirror.style[prop] = computed[prop]
  })

  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.top = '-9999px'
  mirror.style.left = '-9999px'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'

  document.body.appendChild(mirror)

  const textBeforeCaret = element.value.substring(0, position)
  mirror.textContent = textBeforeCaret

  // Create a span for the caret position
  const caretSpan = document.createElement('span')
  caretSpan.textContent = '|'
  mirror.appendChild(caretSpan)

  const coordinates = {
    top: caretSpan.offsetTop,
    left: caretSpan.offsetLeft,
    height: caretSpan.offsetHeight
  }

  document.body.removeChild(mirror)
  return coordinates
}

audlInput.addEventListener('input', () => {
  const pos = audlInput.selectionStart
  const text = audlInput.value.slice(0, pos)

  // Find the current word being typed
  const wordMatch = text.match(/(\b\w*)$/)
  if (!wordMatch || wordMatch[1].length === 0) {
    autocompleteList.style.display = 'none'
    selectedIndex = -1
    return
  }

  const word = wordMatch[1].toLowerCase()
  const matches = AUDL_TAGS.filter(tag => tag.toLowerCase().startsWith(word))

  if (!matches.length) {
    autocompleteList.style.display = 'none'
    selectedIndex = -1
    return
  }

  // Calculate caret position
  const caretCoords = getCaretCoordinates(audlInput, pos)
  const textareaRect = audlInput.getBoundingClientRect()

  // Position autocomplete near caret
  const top = caretCoords.top + caretCoords.height + 5
  const left = Math.min(caretCoords.left, textareaRect.width - 200) // Prevent overflow

  autocompleteList.style.top = `${top}px`
  autocompleteList.style.left = `${left}px`

  // Show autocomplete with keyboard navigation
  selectedIndex = -1
  autocompleteList.innerHTML = ''
  matches.forEach((tag, index) => {
    const div = document.createElement('div')
    div.textContent = tag
    div.className = 'autocomplete-item'
    div.addEventListener('mousedown', e => {
      e.preventDefault()
      insertAutocomplete(tag, word, pos)
    })
    div.addEventListener('mouseenter', () => {
      selectedIndex = index
      updateSelectedItem()
    })
    autocompleteList.appendChild(div)
  })
  autocompleteList.style.display = 'block'

  function insertAutocomplete(tag, word, pos) {
    const wordStart = pos - word.length
    const before = audlInput.value.slice(0, wordStart)
    const after = audlInput.value.slice(pos)
    audlInput.value = before + tag + after
    audlInput.selectionStart = audlInput.selectionEnd = wordStart + tag.length
    autocompleteList.style.display = 'none'
    selectedIndex = -1
    updateOutput()
    audlInput.focus()
  }

  function updateSelectedItem() {
    const items = autocompleteList.querySelectorAll('.autocomplete-item')
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === selectedIndex)
    })
  }

  // Handle keyboard navigation in autocomplete
  audlInput.addEventListener('keydown', function handleAutocompleteKeys(e) {
    if (autocompleteList.style.display === 'none') return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex = Math.min(selectedIndex + 1, matches.length - 1)
      updateSelectedItem()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex = Math.max(selectedIndex - 1, -1)
      updateSelectedItem()
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      const selectedTag = matches[selectedIndex]
      insertAutocomplete(selectedTag, word, pos)
    }
  })
})

// Hide autocomplete on click outside, escape, or tab
document.addEventListener('click', e => {
  if (!autocompleteList.contains(e.target) && e.target !== audlInput) {
    autocompleteList.style.display = 'none'
    selectedIndex = -1
  }
})

audlInput.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === 'Tab') {
    autocompleteList.style.display = 'none'
    selectedIndex = -1
  }
})

// Update output on input
audlInput.addEventListener('input', updateOutput)

// Load from localStorage if available
const saved = localStorage.getItem('audlCode')
if (saved) {
  audlInput.value = saved
}

// Save on every change
audlInput.addEventListener('input', () => {
  localStorage.setItem('audlCode', audlInput.value)
})

// Initial compile
updateOutput()
