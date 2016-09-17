// import(s)
const {
  extend,
  bind,
  isPlainObject,
  resolveAsset
} = Vue.util


// validators

function isInteger (val) {
  return /^(-?[1-9]\d*|0)$/.test(val)
}

function minlength (val, min) {
  if (typeof val === 'string') {
    return isInteger(min, 10) && val.length >= parseInt(min, 10)
  } else if (Array.isArray(val)) {
    return val.length >= parseInt(min, 10)
  } else {
    return false
  }
}

function maxlength (val, max) {
  if (typeof val === 'string') {
    return isInteger(max, 10) && val.length <= parseInt(max, 10)
  } else if (Array.isArray(val)) {
    return val.length <= parseInt(max, 10)
  } else {
    return false
  }
}

function required (val) {
  if (Array.isArray(val)) {
    if (val.length !== 0) {
      let valid = true
      for (let i = 0, l = val.length; i < l; i++) {
        valid = required(val[i])
        if (!valid) {
          break
        }
      }
      return valid
    } else {
      return false
    }
  } else if (typeof val === 'number' || typeof val === 'function') {
    return true
  } else if (typeof val === 'boolean') {
    return val
  } else if (typeof val === 'string') {
    return val.length > 0
  } else if (val !== null && typeof val === 'object') {
    return Object.keys(val).length > 0
  } else if (val === null || val === undefined) {
    return false
  }
}

// end of validators


// validator assets

const validators = { required, minlength, maxlength }
const assets = Object.create(null)
extend(assets, validators)
Vue.options.validators = assets

const strats = Vue.config.optionMergeStrategies
if (strats) {
  strats.validators = (parent, child) => {
    if (!child) { return parent }
    if (!parent) { return child }
    const ret = Object.create(null)
    extend(ret, parent)
    for (let key in child) {
      ret[key] = child[key]
    }
    return ret
  }
}

Vue.validator = (id, definition) => {
  if (!definition) {
    return Vue.options['validators'][id]
  } else {
    Vue.options['validators'][id] = definition
  }
}

// end of validator assets


// validate & validate-control component

function getValidatorResult (validator, results) {
  let ret = null
  if (results.length === 0) { return false }
  ret = false
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.name !== validator) {
      continue
    } else {
      if (typeof result.value === 'boolean' && !result.value) {
        ret = true
        break
      }
      if (typeof result.value === 'string' && !result.value) {
        ret = result.value
        break
      }
    }
  }
  return ret
}

const baseProps = {
  field: {
    type: String, required: true
  },
  groups: {
    type: [String, Array],
    default: null
  },
  auto: {
    type: Boolean,
    default: true
  },
  validators: {
    type: [String, Array, Object],
    required: true
  }
}

const validateControl = {
  name: 'validate-control',
  data () {
    return {
      results: [],
      dirty: false,
      touched: false,
      modified: false
    }
  },
  computed: {
    valid () {
      let ret = null;
      if (this.results.length === 0) { return true }
      ret = true
      for (let i = 0; i < this.results.length; i++) {
        const result = this.results[i]
        if (typeof result.value === 'boolean' && !result.value) {
          ret = false
          break
        }
        if (typeof result.value === 'string' && result.value) {
          ret = false
          break
        }
      }
      return ret
    },
    invalid () {
      return !this.valid
    },
    pristin () {
      return !this.dirty
    },
    untouched () {
      return !this.touched
    },
    result () {
      const ret = {
        valid: this.valid,
        invalid: this.invalid,
        dirty: this.dirty,
        pristin: this.pristin,
        touched: this.touched,
        untouched: this.untouched,
        modified: this.modified
      }
      this._validators.forEach(validator => {
        ret[validator] = this[validator]
      })
      return ret
    }
  },
  render (h) {
    console.log(`${this.$vnode.tag}#render`, this, this.child, this._vnode, this._vnode ? this._vnode.elm : null)
    const sources = this.getChildEventSources(this.child)
    const events = Object.keys(sources)
    //console.log('child events', events)
    events.forEach(event => {
      let source = sources[event]
      const wrapped = (e) => {
        if (e.target) {
          e.$validity = this
        }
        //console.log(`wrapped child ${event} event at render`, e)
        //if (event === 'input' && this.invalid) { return }
        source.call(this, e)
      }
      sources[event] = wrapped
    })
    return this.child
  },
  created () {
    console.log(`validate-control#created`, this)
    if (typeof this.validators === 'string') {
      this._validators = [this.validators]
    } else if (Array.isArray(this.validators)) {
      this._validators = this.validators
    } else {
      this._validators = Object.keys(this.validators)
    }

    this._modified = false
  },
  mounted () {
    console.log(`${this.$vnode.tag}#mounted`, this.child)
    this._initValue = this._getValue(this.$el, this.child)

    this._listenToucheableEvent(this.$el, this.child)
    this._listenInputableEvent(this.$el, this.child)

    this._listenChildComponentEvents()
  },
  beforeUpdate () {
    console.log(`${this.$vnode.tag}#beforeUpdate`, this.$vnode)
    // TODO: should be implemented resource refleshing
  },
  updated () {
    console.log(`${this.$vnode.tag}#updated`, this.$vnode)
    // TODO: should be implemented resource setting
  },
  destroyed () {
    console.log(`${this.$vnode.tag}#destroyed`, this.$vnode)
    // TODO: should be implemented resource releasing
    this._unlistenChildComponentEvents()

    this._unlistenToucheableEvent(this.$el, this.child)
    this._unlistenInputableEvent(this.$el, this.child)
  },
  methods: {
    $validate (value, cb) {
      this.results = []
      // TODO: should be implmented async validation
      this._validators.forEach(name => {
        const arg = typeof this.validators === 'object' ? this.validators[name] : null
        const fn = resolveAsset(this.$options, 'validators', name)
        const result = fn(value, arg)
        this.results.push({ name: name, value: result })
      })
      this._fireEvent('input', this.result)
      cb && cb(this.result)
    },
    _updateTouched (e) {
      if (!this.touched) {
        this.touched = true
        this._fireEvent('touched', this)
      }
    },
    _listenToucheableEvent (el) {
      el.addEventListener('blur', this._updateTouched, true)
    },
    _unlistenToucheableEvent (el) {
      el.removeEventListener('blur', this._updateTouched)
    },
    _listenInputableEvent (el, vnode) {
      // TODO: should be extract classify
      if (!vnode.child) { // built-in html element
        if (el.tagName === 'SELECT') {
          el.addEventListener('change', this._handleInputable)
        } else {
          if (el.type === 'radio' || el.type === 'checkbox') {
            el.addEventListener('change', this._handleInputable)
          } else {
            el.addEventListener('input', this._handleInputable)
          }
        }
      } else { // component
        if (vnode.tag.match(/vue-component/)) {
          this._unwatchInputable = vnode.child.$watch('value', this._watchInputable)
        }
      }
    },
    _unlistenInputableEvent (el, vnode) {
      // TODO: should be extract classify
      if (!vnode.child) { // built-in html element
        if (el.tagName === 'SELECT') {
          el.removeEventListener('change', this._handleInputable)
        } else {
          if (el.type === 'radio' || el.type === 'checkbox') {
            el.removeEventListener('change', this._handleInputable)
          } else {
            el.removeEventListener('input', this._handleInputable)
          }
        }
      } else { // component
        if (vnode.tag.match(/vue-component/)) {
          this._unwatchInputable()
          this._unwatchInputable = undefined
        }
      }
    },
    _handleInputable (e) {
      const el = e.target
      const value = this._getValue(el, this.child)

      this._updateDirty(el, this.child)
      this._updateModified(el, this.child)

      if (this.auto) {
        this.$validate(value, result => {
          const type = result.valid ? 'valid' : 'invalid'
          this._fireEvent(type, this)
        })
      }
    },
    _watchInputable (val, old) {
      this._updateDirty(this.$el, this.child)
      this._updateModified(this.$el, this.child)

      if (this.auto) {
        this.$validate(val, result => {
          const type = result.valid ? 'valid' : 'invalid'
          this._fireEvent(type, this)
        })
      }
    },
    _getValue (el, vnode) {
      // TODO: should be extract classify
      if (!vnode.child) { // built-in html element
        if (el.tagName === 'SELECT') {
        } else {
          if (el.type === 'radio' || el.type === 'checkbox') {
          } else {
            return el.value
          }
        }
      } else { // component
        if (vnode.tag.match(/vue-component/)) {
          return vnode.child.value
        }
      }
    },
    _updateDirty (el, vnode) {
      if (!this.dirty && this._checkModified(el, vnode)) {
        this.dirty = true
        this._fireEvent('dirty', this)
      }
    },
    _updateModified (el, vnode) {
      const modified = this.modified = this._checkModified(el, vnode)
      if (this._modified !== modified) {
        this._modified = modified
        this._fireEvent('modified', this)
      }
    },
    _checkModified (el, vnode) {
      // TODO: should be extract classify
      if (!vnode.child) { // built-in html element
        if (el.tagName === 'SELECT') {
        } else {
          if (el.type === 'radio' || el.type === 'checkbox') {
          } else {
            return this._initValue !== this._getValue(el, vnode)
          }
        }
      } else { // component
        if (vnode.tag.match(/vue-component/)) {
          return this._initValue !== vnode.child.value  
        }
      }
    },
    _fireEvent (type, ...args) {
      this.$nextTick(() => {
        this.$emit(type, ...args)
      })
    },
    _listenChildComponentEvents () {
      const child = this.child
      const events = Object.keys(this.getChildEventSources(this.child))
      //const events2 = Object.keys(this.$vnode.componentOptions.listeners)
      //console.log('monitorEvents child.events', events)
      //console.log('listen $vnode.events', events2)
      if (child.child && child.tag.match(/vue-component/)) {
        this._validationEventHandlers = {}
        events.forEach(event => {
          //console.log('event:', event, this.$vnode.componentOptions.listeners[event])
          // TODO: event filers
          if (event === 'input') { return }
          const handler = (e) => {
            e.$validity = this
            //console.log(`wrapped child ${event} event hogehoge`, e)
            this.$emit(event, e)
          }
          this.$el.addEventListener(event, handler)
          this._validationEventHandlers[event] = handler
        })
      }
    },
    _unlistenChildComponentEvents () {
      const child = this.child
      if (child.child && child.tag.match(/vue-component/)) {
        const events = Object.keys(this._validationEventHandlers)
        events.forEach(event => {
          const handler = this._validationEventHandlers[event]
          this.$el.removeEventListener(event, handler)
        })
        this._validationEventHandlers = null
      }
    },
    getChildEventSources (child) { // for v-model input event
      if (child.tag.match(/vue-component/)) {
        //console.log('getChildEventSources from componentOptions', Object.keys(child.componentOptions.listeners), Object.keys(this._events))
        return child.componentOptions.listeners
      } else {
        //console.log('getChildEventSources from data', Object.keys(child.data.on), Object.keys(this._events))
        return child.data.on
      }
    }
  }
}

const vcCaches = Object.create(null)

function defineValidateControl (field, target, props) {
  if (vcCaches[field]) { return vcCaches[field] }

  let validators = props.validators
  if (typeof validators === 'string') {
    validators = [validators]
  } else if (Array.isArray(props.validators)) {
    validators = props.validators
  } else if (isPlainObject(props.validators)) {
    validators = Object.keys(props.validators)
  }

  const computed = extend({}, target.computed)
  const methods = extend({}, target.methods)
  const validateControl = extend({}, target)
  validateControl.computed = computed
  validateControl.methods = methods

  const validateControlProps = {}
  extend(validateControlProps, baseProps)
  extend(validateControlProps, {
    child: { type: Object },
    value: { type: Object }
  })
  validateControl.props = validateControlProps

  validators.forEach(validator => {
    validateControl.computed[validator] = function () {
      return getValidatorResult(validator, this.results)
    }
  })

  return vcCaches[field] = Vue.extend(validateControl)
}

Vue.component('validate',{
  functional: true,
  props: baseProps,
  render (h, { props, parent, data, children }) {
    console.log('validate#render', parent, props, data, children())
    const childs = children()
    return childs.map((child) => {
      if (!child.tag) { return child }
      const newData = extend({}, data)
      newData.props = extend({}, props)
      newData.props.child = child
      return h(defineValidateControl(props.field, validateControl, props), newData)
    })
  }
})

const validatoinControl = {
  name: 'validation-control',
  props: ['name', 'groups', 'child'],
  render (h) {
    console.log(`${this.$vnode.tag}#render`, this)
    return this.child
  }
}

Vue.component('validation', {
  functional: true,
  props: ['tag', 'name', 'groups'],
  render (h, { data, props, children }) {
    console.log('validation#render', data, props)
      /*
    const tag = this.tag || this.$vnode.data.tag || 'form'
    const children = this.$slots.default || []
    children.forEach(child => {
      console.log('foo', child, child.data)
    })
    return h(tag, { staticAttrs: { novalidate: ''} }, children)
    */
    return children()
  }
})

// end of validate & validate-control component


/**
 * main
 */
const vm = new Vue({
  data: {
    msg: 'hello',
    selected: 'A',
    showComponent: true,
    enableAuto: true,
    validation: {
      field1: {},
      field2: {}
    },
    options: [
      { text: 'One', value: 'A' },
      { text: 'Two', value: 'B' },
      { text: 'Three', value: 'C' }
    ]
  },
  components: {
    'my-comp': {
      template: `<select>
        <option v-for="option in options" :value="option.value">{{option.text}}</option>
      </select>`,
      props: ['options', 'value'],
      created () {
        console.log('my-comp#created', this)
      },
      mounted () {
        console.log(`${this.$vnode.tag}#mounted`, this)
        this._handle = (e) => {
          this.$emit('input', e.target.value)
        }
        this.$el.addEventListener('change', this._handle)
      },
      destroyed () {
        console.log(`${this.$vnode.tag}#destroyed`, this)
        this.$el.removeEventListener('change', this._handle)
      }
    }
  },
  methods: {
    onValid (e) {
      console.log('onValid', e)
      //this.validation.field1 = e.result
    },
    onValid2 (e) {
      console.log('onValid2', e)
      this.validation.field2 = e.result
    },
    onInvalid (e) {
      console.log('onInvalid', e)
      this.validation.field1 = e.result
    },
    onDirty (e) {
      console.log('onDirty', e)
      this.validation.field1 = e.result
    },
    onTouched (e) {
      console.log('onTouched', e)
      this.validation.field1 = e.result
    },
    onModified (e) {
      console.log('onModified', e)
      this.validation.field1 = e.result
    },
    onBlur (e) {
      console.log('onBlur', e)
      if (!this.enableAuto) {
        e.$validity.$validate(e.$validity.$el.value, result => {
          this.validation.field1 = result
        })
      } else {
        this.validation.field1 = e.result
      }
    },
    onFocus (e) {
      console.log('onFocus', e)
    },
    onMouseEnter (e) {
      console.log('onMouseEnter', e)
    },
    onInput (e) {
      console.log('onInput', e)
    }
  }
}).$mount('#app')
