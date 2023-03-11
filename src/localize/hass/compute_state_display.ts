// home-assistant/frontend/src/common/entity/compute_state_display.ts

import { HassEntity } from "home-assistant-js-websocket";
import { UNAVAILABLE, UNKNOWN } from "./entity";
import { formatDuration, UNIT_TO_SECOND_CONVERT } from "./duration";
import { formatDate } from "./format_date";
import { formatDateTime } from "./format_date_time";
import { formatTime } from "./format_time";
import {
    formatNumber,
    getNumberFormatOptions,
    isNumericFromAttributes,
} from "./format_number";
import { blankBeforePercent } from "./blank_before_percent";
import { LocalizeFunc } from "./localize"; //type
import { computeDomain } from "./compute_domain";
import { EntityRegistryDisplayEntry, FrontendLocaleDataFixed, HomeAssistantFixed } from "../../types/fixes";

export const computeStateDisplay = (
    localize: LocalizeFunc,
    stateObj: HassEntity,
    locale: FrontendLocaleDataFixed,
    entities: HomeAssistantFixed["entities"],
    skipUnit = false,
): string =>
    computeStateDisplayFromEntityAttributes(
        localize,
        locale,
        entities,
        stateObj.entity_id,
        stateObj.attributes,
        stateObj.state,
        skipUnit
    );

export const computeStateDisplayFromEntityAttributes = (
    localize: LocalizeFunc,
    locale: FrontendLocaleDataFixed,
    entities: HomeAssistantFixed["entities"],
    entityId: string,
    attributes: any,
    state: string,
    skipUnit = false,
): string => {
    if (state === UNKNOWN || state === UNAVAILABLE) {
        return localize(`state.default.${state}`);
    }

    const entity = entities[entityId] as EntityRegistryDisplayEntry | undefined;

    // Entities with a `unit_of_measurement` or `state_class` are numeric values and should use `formatNumber`
    if (isNumericFromAttributes(attributes)) {
        // state is duration
        if (
            attributes.device_class === "duration" &&
            attributes.unit_of_measurement &&
            UNIT_TO_SECOND_CONVERT[attributes.unit_of_measurement]
        ) {
            try {
                return formatDuration(state, attributes.unit_of_measurement);
            } catch (_err) {
                // fallback to default
            }
        }
        if (attributes.device_class === "monetary") {
            try {
                return formatNumber(state, locale, {
                    style: skipUnit ? undefined: "currency",
                    currency: attributes.unit_of_measurement,
                    minimumFractionDigits: 2,
                    // Override monetary options with number format
                    ...getNumberFormatOptions(
                        { state, attributes } as HassEntity,
                        entity
                    ),
                });
            } catch (_err) {
                // fallback to default
            }
        }
        const unit = !attributes.unit_of_measurement || skipUnit
            ? ""
            : attributes.unit_of_measurement === "%"
                ? blankBeforePercent(locale) + "%"
                : ` ${attributes.unit_of_measurement}`;
        return `${formatNumber(
            state,
            locale,
            getNumberFormatOptions({ state, attributes } as HassEntity, entity)
        )}${unit}`;
    }

    const domain = computeDomain(entityId);

    if (domain === "input_datetime") {
        if (state !== undefined) {
            // If trying to display an explicit state, need to parse the explicit state to `Date` then format.
            // Attributes aren't available, we have to use `state`.
            try {
                const components = state.split(" ");
                if (components.length === 2) {
                    // Date and time.
                    return formatDateTime(new Date(components.join("T")), locale);
                }
                if (components.length === 1) {
                    if (state.includes("-")) {
                        // Date only.
                        return formatDate(new Date(`${state}T00:00`), locale);
                    }
                    if (state.includes(":")) {
                        // Time only.
                        const now = new Date();
                        return formatTime(
                            new Date(`${now.toISOString().split("T")[0]}T${state}`),
                            locale
                        );
                    }
                }
                return state;
            } catch (_e) {
                // Formatting methods may throw error if date parsing doesn't go well,
                // just return the state string in that case.
                return state;
            }
        } else {
            // If not trying to display an explicit state, create `Date` object from `stateObj`'s attributes then format.
            let date: Date;
            if (attributes.has_date && attributes.has_time) {
                date = new Date(
                    attributes.year,
                    attributes.month - 1,
                    attributes.day,
                    attributes.hour,
                    attributes.minute
                );
                return formatDateTime(date, locale);
            }
            if (attributes.has_date) {
                date = new Date(attributes.year, attributes.month - 1, attributes.day);
                return formatDate(date, locale);
            }
            if (attributes.has_time) {
                date = new Date();
                date.setHours(attributes.hour, attributes.minute);
                return formatTime(date, locale);
            }
            return state;
        }
    }

    if (domain === "humidifier") {
        if (state === "on" && attributes.humidity) {
            return `${attributes.humidity} %`;
        }
    }

    // `counter` `number` and `input_number` domains do not have a unit of measurement but should still use `formatNumber`
    if (
        domain === "counter" ||
        domain === "number" ||
        domain === "input_number"
    ) {
        // Format as an integer if the value and step are integers
        return formatNumber(
            state,
            locale,
            getNumberFormatOptions({ state, attributes } as HassEntity, entity)
        );
    }

    // state of button is a timestamp
    if (
        domain === "button" ||
        domain === "input_button" ||
        domain === "scene" ||
        (domain === "sensor" && attributes.device_class === "timestamp")
    ) {
        try {
            return formatDateTime(new Date(state), locale);
        } catch (_err) {
            return state;
        }
    }

    return (
        (entity?.translation_key &&
            localize(
                `component.${entity.platform}.entity.${domain}.${entity.translation_key}.state.${state}`
            )) ||
        // Return device class translation
        (attributes.device_class &&
            localize(
                `component.${domain}.state.${attributes.device_class}.${state}`
            )) ||
        // Return default translation
        localize(`component.${domain}.state._.${state}`) ||
        // We don't know! Return the raw state.
        state
    );
};
