import {ChronoAtom} from "../chrono/Atom.js";
import {ChronoGraph, PropagationResult} from "../chrono/Graph.js";
import {AnyConstructor, Mixin} from "../class/Mixin.js";
import {Entity as EntityData} from "../schema/Entity.js";
import {Field, Name} from "../schema/Field.js";
import {uppercaseFirst} from "../util/Helper.js";
import {EntityAtom, FieldAtom, MinimalEntityAtom, MinimalFieldAtom} from "./Atom.js";


// LAZY ATOMS CREATION - investigate if it improves performance
// current issues
// 1) when entity enters a graph, the yet unreferenced atoms are not created yet (naturally)
// so they are not calculated
// need to create AND calculate them **synchronously** later, on-demand - how to deal with effects?

// const atomsCollectionMixin = (base : typeof Base, name) =>
//
// class AtomsCollection extends base {
// POSSIBLE OPTIMIZATION - use more than 1 getter, like: const atomsCollectionMixin = (base : typeof Base, name1, name2, name3)
//     get [name] () {
//         return super[ name ] = (this as any).host.createFieldAtom(name)
//     }
// }
//

const isEntity      = Symbol('isEntity')

//---------------------------------------------------------------------------------------------------------------------
export const Entity = <T extends AnyConstructor<object>>(base : T) => {

    class Entity extends base {
        // marker in the prototype
        [isEntity] () {}

        $calculations   : { [s in keyof this] : string }

// LAZY ATOMS CREATION - investigate if it improves performance
//         static atomsCollectionCls : AnyConstructor
//
//         static getAtomsCollectionCls () : AnyConstructor {
//             if (this.atomsCollectionCls) return this.atomsCollectionCls
//
//             let cls         = Base
//
//             this.prototype.$entity.fields.forEach((field : Field, name : Name) => {
//                 cls         = atomsCollectionMixin(cls, name)
//             })
//
//             return this.atomsCollectionCls = cls
//         }
//
//
//         get $ () : { [s in keyof this] : MinimalFieldAtom } {
//             // @ts-ignore
//             const atomsCollection   = this.constructor.getAtomsCollectionCls().new()
//
//             Object.defineProperty(atomsCollection, 'host', { enumerable : false, value : this })
//
//             // @ts-ignore
//             return super.$          = atomsCollection
//         }


        // lazy meta instance creation - will work even w/o any @field or @entity decorator
        get $entity() : EntityData {
            // this will lazily create an EntityData instance in the prototype
            return createEntityOnPrototype(this.constructor.prototype)
        }


        get $() : { [s in keyof this] : FieldAtom } {
            const atomsCollection   = {}

            this.$entity.forEachField((field : Field, name : Name) => {
                atomsCollection[ name ] = this.createFieldAtom(field)
            })

            Object.defineProperty(this, '$', { value : atomsCollection })

            return atomsCollection as any
        }


        get $$() : EntityAtom {
            const value     = MinimalEntityAtom.new({ entity : this.$entity, value : this, self : this })

            Object.defineProperty(this, '$$', { value : value })

            return value
        }


        // the actually returned type is `FieldAtom`, but this does not typecheck - circularity
        createFieldAtom (field : Field) : ChronoAtom {
            const name                  = field.name

            const calculationFunction   = this.$calculations && this[ this.$calculations[ name ] ]

            return field.atomCls.new({
                id                  : `${this.$$.id}/${name}`,

                field               : field,

                self                : this,

                shouldCommitValue   : !field.continued,

                calculationContext  : calculationFunction ? this : undefined,
                calculation         : calculationFunction
            })
        }


        getGraph () : ChronoGraph {
            return this.$$.graph
        }


        forEachFieldAtom (func : (field : MinimalFieldAtom, name : Name) => any) {
            const fields        = this.$

            for (let name in fields) {
                func.call(this, fields[ name ], name)
            }
        }


        enterGraph (graph : ChronoGraph) {
            this.forEachFieldAtom(field => graph.addNode(field))

            graph.addNode(this.$$)
        }


        leaveGraph () {
            const graph     = this.$$.graph

            if (graph) {
                this.forEachFieldAtom(field => graph.removeNode(field))

                graph.removeNode(this.$$)
            }
        }


        async propagate () : Promise<PropagationResult> {
            return this.getGraph().propagate()
        }


        markAsNeedRecalculation (atom : ChronoAtom) {
            this.getGraph().markAsNeedRecalculation(atom)
        }


        markStable (atom : ChronoAtom) {
            this.getGraph().markStable(atom)
        }


        // isStable (atom : ChronoAtom) : boolean {
        //     return this.getGraph().isAtomStable(atom)
        // }


        // processNext (atom : ChronoAtom) {
        //     this.getGraph().processNext(atom)
        // }




        static getField (name : Name) : Field {
            return this.getEntity().getField(name)
        }


        static getEntity () : EntityData {
            return ensureEntityOnPrototype(this.prototype)
        }

    }

    return Entity
}

export type Entity = Mixin<typeof Entity>


//---------------------------------------------------------------------------------------------------------------------
export const createEntityOnPrototype = (proto : any) : EntityData => {
    let parent      = Object.getPrototypeOf(proto)

    const entity    = EntityData.new({ parentEntity : parent.hasOwnProperty(isEntity) ? null : parent.$entity })

    Object.defineProperty(proto, '$entity', { value : entity })

    return entity
}


//---------------------------------------------------------------------------------------------------------------------
export const ensureEntityOnPrototype = (proto : any) : EntityData => {
    let entity      = proto.$entity

    if (!proto.hasOwnProperty('$entity')) entity = createEntityOnPrototype(proto)

    return entity
}



//---------------------------------------------------------------------------------------------------------------------
export const generic_field = function (fieldCls : typeof Field, fieldConfig? : object) : PropertyDecorator {

    return function (target : Entity, propertyKey : string) : void {
        let entity      = ensureEntityOnPrototype(target)

        const field     = entity.addField(
            fieldCls.new(Object.assign(fieldConfig || {}, {
                name    : propertyKey
            }))
        );

        if (field.createAccessors) {

            Object.defineProperty(target, propertyKey, {
                get     : function () {
                    return this.$[ propertyKey ].get()
                },

                set     : function (value : any) {
                    return this.$[ propertyKey ].put(value)
                }
            })

            const getterFnName = `get${ uppercaseFirst(propertyKey) }`
            const setterFnName = `set${ uppercaseFirst(propertyKey) }`

            if (!(getterFnName in target)) {
                target[ getterFnName ] = function (...args) : unknown {
                    return this.$[ propertyKey ].get(...args)
                }
            }

            if (!(setterFnName in target)) {
                target[ setterFnName ] = function (...args) : Promise<PropagationResult> {
                    return this.$[ propertyKey ].set(...args)
                }
            }
        }
    }
}



//---------------------------------------------------------------------------------------------------------------------
export const field : PropertyDecorator = generic_field(Field)


//---------------------------------------------------------------------------------------------------------------------
export const continuationOf = function (continuationOfAtomName : string) : PropertyDecorator {

    return function (target : Entity, propertyKey : string) : void {
        const entity            = target.$entity
        const field             = entity.getField(propertyKey)
        const precedingField    = entity.getField(continuationOfAtomName)

        field.continuationOf        = precedingField
        precedingField.continued    = true
    }
}


//---------------------------------------------------------------------------------------------------------------------
export const calculate = function (fieldName : Name) : MethodDecorator {

    // `target` will be a prototype of the class with Entity mixin
    return function (target : Entity, propertyKey : string, /*descriptor*/_ : TypedPropertyDescriptor<any>) : void {
        let calculations        = target.$calculations

        if (!calculations) calculations = target.$calculations = <any>{}

        calculations[ fieldName ]       = propertyKey
    }
}
