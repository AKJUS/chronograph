import { buildClass } from "../class/InstanceOf.js"
import { Base } from "../class/Mixin.js"
import {
    CalculationContext,
    CalculationGen,
    CalculationIterator,
    CalculationSync,
    Context,
    Contexts,
    ContextSync
} from "../primitives/Calculation.js"
import { prototypeValue } from "../util/Helpers.js"
import { CheckoutI } from "./Checkout.js"
import { ProposedOrCurrent } from "./Effect.js"
import { Quark, QuarkConstructor } from "./Quark.js"
import { Transaction, YieldableValue } from "./Transaction.js"

//---------------------------------------------------------------------------------------------------------------------
export const NoProposedValue    = Symbol('NoProposedValue')

//---------------------------------------------------------------------------------------------------------------------
export class Identifier<ContextT extends Context = Context, ValueT = any> extends Base {
    name                : any       = undefined

    ArgsT               : any[]
    YieldT              : YieldableValue
    ValueT              : ValueT

    context             : any       = undefined

    segment             : symbol
    level               : number    = 10

    lazy                : boolean   = false

    quarkClass          : QuarkConstructor


    equality (v1 : this[ 'ValueT' ], v2 : this[ 'ValueT' ]) : boolean {
        return v1 === v2
    }


    calculation (context : CalculationContext<this[ 'YieldT' ]>) : Contexts<ValueT, this[ 'YieldT' ]>[ ContextT ] {
        throw new Error("Abstract method `calculation` called")
    }


    write (transaction : Transaction, quark : InstanceType<this[ 'quarkClass' ]>, proposedValue : this[ 'ValueT' ], ...args : this[ 'ArgsT' ]) {
        quark.proposedValue = proposedValue
    }


    buildProposedValue (transaction : Transaction, quark : InstanceType<this[ 'quarkClass' ]>) : ValueT | typeof NoProposedValue {
        return NoProposedValue
    }


    enterGraph (graph : CheckoutI) {
    }


    leaveGraph (graph : CheckoutI) {
    }
}


//---------------------------------------------------------------------------------------------------------------------
export class Variable<ResultT = any> extends Identifier<typeof ContextSync, ResultT> {
    YieldT              : never

    @prototypeValue(buildClass(Set, CalculationSync, Quark))
    quarkClass          : QuarkConstructor


    calculation (context : CalculationContext<this[ 'YieldT' ]>) : ResultT {
        throw new Error("The 'calculation' method of the variables should not be called for optimization purposes. Instead the value should be set directly to quark")
    }


    write (transaction : Transaction, quark : InstanceType<this[ 'quarkClass' ]>, proposedValue : this[ 'ValueT' ], ...args : this[ 'ArgsT' ]) {
        quark.value         = proposedValue
    }
}

//---------------------------------------------------------------------------------------------------------------------
export class CalculatedValueSync extends Identifier {

    @prototypeValue(buildClass(Set, CalculationSync, Quark))
    quarkClass          : QuarkConstructor


    calculation (YIELD : CalculationContext<this[ 'YieldT' ]>) : this[ 'ValueT' ] {
        return YIELD(ProposedOrCurrent)
    }
}


//---------------------------------------------------------------------------------------------------------------------
export class CalculatedValueGen extends Identifier {

    @prototypeValue(buildClass(Set, CalculationGen, Quark))
    quarkClass          : QuarkConstructor


    * calculation (context : CalculationContext<this[ 'YieldT' ]>) : CalculationIterator<this[ 'ValueT' ], this[ 'YieldT' ]> {
        return yield ProposedOrCurrent
    }
}


//---------------------------------------------------------------------------------------------------------------------
export const throwUnknownIdentifier = (identifier : Identifier) => { throw new Error(`Unknown identifier ${identifier}`) }
