import ReactHotLoader from 'react-hot-loader'

import React from 'react'
import ReactDom from 'react-dom'

import Menu from './Menu'

import bigList from './bigList'
import propsChanges from './propsChanges'
import stateChanges from './stateChanges'
import childOfPureComponent from './childOfPureComponent'
import bothChanges from './bothChanges'
import noChanges from './noChanges'
import specialChanges from './specialChanges'
import ssr from './ssr'
import hotReload from './hotReload'
import createFactory from './createFactory'
import cloneElement from './cloneElement'
import useState from './hooks/useState'
import useReducer from './hooks/useReducer'
import useContext from './hooks/useContext'
import useMemo from './hooks/useMemo'
import strict from './strict'
import reactRedux from './reactRedux'

import whyDidYouRender from './whyDidYouRender'

const demosList = {
  bigList,
  propsChanges,
  stateChanges,
  childOfPureComponent,
  bothChanges,
  noChanges,
  specialChanges,
  ssr,
  hotReload,
  createFactory,
  cloneElement,
  useState,
  useReducer,
  useContext,
  useMemo,
  strict,
  reactRedux
}

const defaultDemoName = 'bigList'

const domDemoElement = document.getElementById('demo')

function changeDemo(demoFn){
  console.clear && console.clear() // eslint-disable-line no-console
  React.__REVERT_WHY_DID_YOU_RENDER__ && React.__REVERT_WHY_DID_YOU_RENDER__()
  ReactDom.unmountComponentAtNode(domDemoElement)
  setTimeout(() => {
    demoFn({whyDidYouRender, domElement: domDemoElement})
  }, 1)
}

const demoFromHash = demosList[window.location.hash.substr(1)]
const initialDemo = demoFromHash || demosList[defaultDemoName]
if(!demoFromHash){
  window.location.hash = defaultDemoName
}

changeDemo(initialDemo.fn)

const DemoLink = ({name, description, fn}) => (
  <li><a href={`#${name}`} onClick={() => changeDemo(fn)}>{description}</a></li>
)

const App = () => (
  <Menu>
    {
      Object
        .entries(demosList)
        .map(([demoName, demoData]) => <DemoLink key={demoName} name={demoName} {...demoData}/>)
    }
  </Menu>
)

export default ReactHotLoader.hot(module)(App)


