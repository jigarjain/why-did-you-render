import {defaults, get, mapValues} from 'lodash'

import normalizeOptions from './normalizeOptions'
import getDisplayName from './getDisplayName'
import getUpdateInfo from './getUpdateInfo'
import shouldTrack from './shouldTrack'
import {checkIfInsideAStrictModeTree} from './utils'

const hasSymbol = typeof Symbol === 'function' && Symbol.for
const REACT_MEMO_TYPE = hasSymbol ? Symbol.for('react.memo') : 0xead3

function patchClassComponent(ClassComponent, displayName, React, options){
  class WDYRPatchedClassComponent extends ClassComponent{
    constructor(props, context){
      super(props, context)

      this._WDYR = {
        renderNumber: 0
      }

      const origRender = super.render || this.render
      // this probably means render is an arrow function or this.render.bind(this) was called on the original class
      const renderIsABindedFunction = origRender !== ClassComponent.prototype.render
      if(renderIsABindedFunction){
        this.render = () => {
          WDYRPatchedClassComponent.prototype.render.apply(this)
          return origRender()
        }
      }
    }
    render(){
      this._WDYR.renderNumber++

      if(!('isStrictMode' in this._WDYR)){
        this._WDYR.isStrictMode = checkIfInsideAStrictModeTree(this)
      }

      // in strict mode- ignore every other render
      if(!(this._WDYR.isStrictMode && this._WDYR.renderNumber % 2 === 1)){
        if(this._WDYR.prevProps){
          options.notifier(getUpdateInfo({
            Component: ClassComponent,
            displayName,
            prevProps: this._WDYR.prevProps,
            prevState: this._WDYR.prevState,
            nextProps: this.props,
            nextState: this.state,
            options
          }))
        }

        this._WDYR.prevProps = this.props
        this._WDYR.prevState = this.state
      }

      return super.render ? super.render() : null
    }
  }

  WDYRPatchedClassComponent.displayName = displayName
  defaults(WDYRPatchedClassComponent, ClassComponent)

  return WDYRPatchedClassComponent
}

function patchFunctionalComponent(FunctionalComponent, displayName, React, options){
  function WDYRFunctionalComponent(nextProps){
    const ref = React.useRef()

    const prevProps = ref.current
    ref.current = nextProps

    if(prevProps){
      const notification = getUpdateInfo({
        Component: FunctionalComponent,
        displayName,
        prevProps,
        nextProps,
        options
      })

      // if a functional component re-rendered without a props change
      // it was probably caused by a hook and we should not care about it
      if(notification.reason.propsDifferences){
        options.notifier(notification)
      }
    }

    return FunctionalComponent(nextProps)
  }

  WDYRFunctionalComponent.displayName = displayName
  WDYRFunctionalComponent.ComponentForHooksTracking = FunctionalComponent
  defaults(WDYRFunctionalComponent, FunctionalComponent)

  return WDYRFunctionalComponent
}

function patchMemoComponent(MemoComponent, displayName, React, options){
  const {type: WrappedFunctionalComponent} = MemoComponent

  function WDYRWrappedByMemoFunctionalComponent(nextProps){
    const ref = React.useRef()

    const prevProps = ref.current
    ref.current = nextProps

    if(prevProps){
      const notification = getUpdateInfo({
        Component: MemoComponent,
        displayName,
        prevProps,
        nextProps,
        options
      })

      // if a memoized functional component re-rendered without props change / prop values change
      // it was probably caused by a hook and we should not care about it
      if(notification.reason.propsDifferences && notification.reason.propsDifferences.length > 0){
        options.notifier(notification)
      }
    }

    return WrappedFunctionalComponent(nextProps)
  }

  WDYRWrappedByMemoFunctionalComponent.displayName = getDisplayName(WrappedFunctionalComponent)
  WDYRWrappedByMemoFunctionalComponent.ComponentForHooksTracking = MemoComponent
  defaults(WDYRWrappedByMemoFunctionalComponent, WrappedFunctionalComponent)

  const WDYRMemoizedFunctionalComponent = React.memo(WDYRWrappedByMemoFunctionalComponent, MemoComponent.compare)

  WDYRMemoizedFunctionalComponent.displayName = displayName
  defaults(WDYRMemoizedFunctionalComponent, MemoComponent)

  return WDYRMemoizedFunctionalComponent
}

function trackHookChanges(hookName, {path: hookPath}, hookResult, React, options){
  const nextHook = hookResult

  const ComponentHookDispatchedFromInstance = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner.current

  if(!ComponentHookDispatchedFromInstance){
    return nextHook
  }

  const Component = ComponentHookDispatchedFromInstance.type.ComponentForHooksTracking || ComponentHookDispatchedFromInstance.type
  const displayName = getDisplayName(Component)

  const isShouldTrack = shouldTrack(Component, displayName, options)
  if(!isShouldTrack){
    return nextHook
  }

  const ref = React.useRef()
  const prevHook = ref.current
  ref.current = nextHook

  if(prevHook){
    const notification = getUpdateInfo({
      Component: Component,
      displayName,
      hookName,
      prevHook: hookPath ? get(prevHook, hookPath) : prevHook,
      nextHook: hookPath ? get(nextHook, hookPath) : nextHook,
      options
    })

    if(notification.reason.hookDifferences){
      options.notifier(notification)
    }
  }

  return ref.current
}

function createPatchedComponent(componentsMap, Component, displayName, React, options){
  if(Component.$$typeof === REACT_MEMO_TYPE){
    return patchMemoComponent(Component, displayName, React, options)
  }

  if(Component.prototype && Component.prototype.isReactComponent){
    return patchClassComponent(Component, displayName, React, options)
  }

  return patchFunctionalComponent(Component, displayName, React, options)
}

function getPatchedComponent(componentsMap, Component, displayName, React, options){
  if(componentsMap.has(Component)){
    return componentsMap.get(Component)
  }

  const WDYRPatchedComponent = createPatchedComponent(componentsMap, Component, displayName, React, options)

  componentsMap.set(Component, WDYRPatchedComponent)
  return WDYRPatchedComponent
}

export const hooksConfig = {
  useState: {path: '0'},
  useReducer: {path: '0'},
  useContext: true,
  useMemo: true
}

export default function whyDidYouRender(React, userOptions){
  const options = normalizeOptions(userOptions)

  const origCreateElement = React.createElement
  const origCreateFactory = React.createFactory

  let componentsMap = new WeakMap()

  React.createElement = function(componentNameOrComponent, ...rest){
    let isShouldTrack = null
    let displayName = null
    let WDYRPatchedComponent = null

    try{
      isShouldTrack = (
        (
          typeof componentNameOrComponent === 'function' ||
          componentNameOrComponent.$$typeof === REACT_MEMO_TYPE
        ) &&
        shouldTrack(componentNameOrComponent, getDisplayName(componentNameOrComponent), options)
      )

      if(isShouldTrack){
        displayName = (
          componentNameOrComponent &&
          componentNameOrComponent.whyDidYouRender &&
          componentNameOrComponent.whyDidYouRender.customName ||
          getDisplayName(componentNameOrComponent)
        )

        WDYRPatchedComponent = getPatchedComponent(componentsMap, componentNameOrComponent, displayName, React, options)
        return origCreateElement.apply(React, [WDYRPatchedComponent, ...rest])
      }
    }
    catch(e){
      options.consoleLog('whyDidYouRender error. Please file a bug at https://github.com/welldone-software/why-did-you-render/issues.', {
        errorInfo: {
          error: e,
          componentNameOrComponent,
          rest,
          options,
          isShouldTrack,
          displayName,
          WDYRPatchedComponent
        }
      })
    }

    return origCreateElement.apply(React, [componentNameOrComponent, ...rest])
  }

  Object.assign(React.createElement, origCreateElement)

  React.createFactory = type => {
    const factory = React.createElement.bind(null, type)
    factory.type = type
    return factory
  }

  Object.assign(React.createFactory, origCreateFactory)

  let origHooks

  if(options.trackHooks){
    const patchedHooks = mapValues(hooksConfig, (hookConfig, hookName) => {
      return (...args) => {
        const origHook = origHooks[hookName]
        if(!origHook){
          throw new Error('[WhyDidYouRender] A problem with React Hooks patching occurred.')
        }
        const hookResult = origHook(...args)
        if(hookConfig){
          trackHookChanges(hookName, hookConfig === true ? {} : hookConfig, hookResult, React, options)
        }
        return hookResult
      }
    })

    Object.defineProperty(
      React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,
      'current',
      {
        set(newHooks){
          origHooks = newHooks && {
            ...newHooks,
            ...newHooks.origHooks
          }
        },
        get(){
          return origHooks && {
            ...origHooks,
            ...patchedHooks,
            origHooks
          }
        }
      }
    )
  }

  React.__REVERT_WHY_DID_YOU_RENDER__ = () => {
    Object.assign(React, {
      createElement: origCreateElement,
      createFactory: origCreateFactory
    })
    componentsMap = null
    Object.defineProperty(
      React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,
      'current',
      {
        writable: true,
        value: origHooks
      }
    )
    delete React.__REVERT_WHY_DID_YOU_RENDER__
  }

  return React
}
