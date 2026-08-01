import HeroesGloryDataModel from "./base-model.mjs";

export default class HeroesGloryItemBase extends HeroesGloryDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.StringField({ required: true, blank: true });

    return schema;
  }

}