
export function applyEventHandlers(element, props) {
  for (const [key, value] of Object.entries(props)) { // iterates over the props.
    if (key.startsWith('on') && typeof value === 'function') { // chck if the prop is an event handler alias and the value is of type function:
      element[key.toLowerCase()] = value; // assign the function to the element element[key.toLowerCase()] = value ==> element.onclick = () => alert("clicked!");
    }
  }
}

// in practice:
// const btnVNode = createElement("button", { onClick: () => alert("Hi!") }, "Click Me");

// const btnEl = render(btnVNode);
// // Inside render() → applyEventHandlers(btnEl, { onClick: ... })

// // After applyEventHandlers runs:
// btnEl.onclick === () => alert("Hi!")  // true