
export function selectPromise(selectDOM, options) {
  while(selectDOM.options.length > 1) {
    selectDOM.remove(selectDOM.options.length - 1);
  }
  const optionMap = {};
  options.forEach(([value, text]) => {
    const optionDOM = document.createElement('option');
    optionDOM.value = value;
    optionDOM.text = text;
    optionMap[value] = [value, text];
    selectDOM.add(optionDOM);
  });
  return new Promise(resolve => {
    selectDOM.onchange = () => {
      if (optionMap[selectDOM.value]) {
        resolve(optionMap[selectDOM.value]);
      }
    };
  });
}
