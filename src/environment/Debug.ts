//---------------------------------------------------------------------------------------------------------------------
export const DEBUG = true

export const DEBUG_MODE = 'THROW'

export const debug = (e) => {
    if (!DEBUG) return

    if (DEBUG_MODE === 'THROW')
        throw e
    else
        debugger
}
