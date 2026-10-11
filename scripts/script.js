let yearElem;
if (yearElem = document.querySelector('[data-js-year]')) {
  const year = (new Date()).getFullYear();
  yearElem.innerText = year;
}
