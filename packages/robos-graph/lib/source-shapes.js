'use strict';

// Declarations and evidence can be represented before deployment/ownership facts
// are known. These shapes never require invented running-system metadata.
const required = (path, message) => ({ path, minCount: 1, message });
const SOURCE_SHAPES = [
  {
    shapeId: 'robos:CurriculumDefinitionShape', targetClass: 'robos:CurriculumDefinition',
    refersFrom: 'https://schema.org/Course', domainStandard: 'https://schema.org/Course',
    properties: [required('dcterms:title', 'Curriculum needs a title.'), required('robos:sourcePath', 'Curriculum needs its source document.'), required('robos:evidence', 'Curriculum needs source evidence.')],
  },
  {
    shapeId: 'robos:DataStoreShape', targetClass: 'robos:DataStore',
    refersFrom: 'https://schema.org/SoftwareApplication', domainStandard: 'https://schema.org/SoftwareApplication',
    properties: [required('dcterms:title', 'Logical data store needs a title.'), required('robos:engine', 'Logical data store needs its engine.'), required('robos:evidence', 'Logical data store needs source evidence.')],
  },
  {
    shapeId: 'robos:BrokerDefinitionShape', targetClass: 'robos:BrokerDefinition',
    refersFrom: 'https://schema.org/Service', domainStandard: 'https://schema.org/Service',
    properties: [required('dcterms:title', 'Broker definition needs a title.'), required('robos:brokerType', 'Broker definition needs its technology.'), required('robos:evidence', 'Broker definition needs source evidence.')],
  },
  {
    shapeId: 'robos:EnvironmentProfileShape', targetClass: 'robos:EnvironmentProfile',
    refersFrom: 'https://schema.org/DefinedTerm', domainStandard: 'https://schema.org/DefinedTerm',
    properties: [required('dcterms:title', 'Environment profile needs a title.'), required('robos:evidence', 'Environment profile needs source evidence.')],
  },
  {
    shapeId: 'robos:SourceArtifactShape', targetClass: 'robos:SourceArtifact',
    refersFrom: 'https://schema.org/CreativeWork', domainStandard: 'https://schema.org/CreativeWork',
    properties: [required('dcterms:title', 'Source artifact needs a title.'), required('robos:sourcePath', 'Source artifact needs a portable source path.'), required('robos:sourceKind', 'Source artifact needs a declared kind.'), required('robos:inRepository', 'Source artifact needs its repository reference.'), required('robos:evidence', 'Source artifact needs source evidence.')],
  },
  {
    shapeId: 'robos:AgentSkillShape', targetClass: 'robos:AgentSkill',
    refersFrom: 'https://schema.org/HowTo', domainStandard: 'https://schema.org/HowTo',
    properties: [required('dcterms:title', 'Agent skill needs a title.'), required('robos:skillName', 'Agent skill needs its declared name.'), required('robos:sourcePath', 'Agent skill needs its instruction file.'), required('robos:inRepository', 'Agent skill needs its repository reference.'), required('robos:evidence', 'Agent skill needs source evidence.')],
  },
];
for (const shape of SOURCE_SHAPES) shape.schemaOrgType = shape.refersFrom;
module.exports = { SOURCE_SHAPES };
