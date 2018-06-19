import Field from './field';

export default class SelectField extends Field {
  _create(props) {
    super._create(props);

    this._setDefaults({ ensureInList: true });

    this.set({
      schema: {
        component: 'Form',
        fields: [
          {
            name: 'options',
            // TODO: define and use a proper field
            component: 'Field'
          },
          {
            name: 'blankString',
            component: 'TextField'
          },
          {
            name: 'ensureInList',
            component: 'BooleanField'
          }
        ]
      }
    });
  }

  set(props) {
    super.set(props);
    this._setIfUndefined(
      props,
      'options',
      'blankString',
      'ensureInList',
      'multiple'
    );
  }

  getOne(name) {
    // We consider the blank string to be a null value. We have to use isValueBlank() to prevent
    // infinite recursion.
    if (name === 'value' && this.isValueBlank(this._value)) {
      return null;
    }

    const value = this._getIfAllowed(
      name,
      'options',
      'blankString',
      'ensureInList',
      'multiple'
    );
    return value === undefined ? super.getOne(name) : value;
  }

  getOptionLabel(value) {
    let label = null;

    if (this._options) {
      this._options.forEach(option => {
        if (option.value === value) {
          label = option.label;
        }
      });
    }

    return label;
  }

  validate() {
    super.validate();

    if (!this.isBlank() && this.get('ensureInList')) {
      const value = this.get('value');
      if (this.getOptionLabel(value) === null) {
        this.setErr(`${value} is not an option`);
      }
    }
  }

  getDisplayValue() {
    const value = this.get('value');
    if (this.isBlank()) {
      return value;
    } else {
      return this.getOptionLabel(value);
    }
  }
}
