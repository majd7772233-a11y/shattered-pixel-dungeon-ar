package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonValue;
import com.badlogic.gdx.utils.JsonWriter;

import java.util.HashMap;
import java.util.Map;

/**
 * Strict JSON writer for protocol payloads assembled from heterogeneous Java Maps.
 *
 * LibGDX's default Map writer serializes unknown Object values with runtime type wrappers.
 * Disabling type names alone is not sufficient: unknown values may recurse forever. This
 * writer supplies the concrete runtime type for every map field, yielding ordinary JSON
 * primitives, arrays and nested objects. It is deliberately write-only; use a normal Json
 * reader for parsing incoming protocol payloads.
 */
public final class NativeCombatJson {

    private NativeCombatJson() {}

    public static Json strictWriter() {
        Json json = new Json(JsonWriter.OutputType.json);
        json.setTypeName(null);
        json.setSerializer(HashMap.class, new Json.Serializer<HashMap>() {
            @Override
            public void write(Json json, HashMap object, Class knownType) {
                json.writeObjectStart();
                for (Object rawEntry : object.entrySet()) {
                    Map.Entry entry = (Map.Entry) rawEntry;
                    String key = String.valueOf(entry.getKey());
                    Object value = entry.getValue();
                    if (value == null) {
                        json.writeValue(key, (Object) null);
                    } else {
                        json.writeValue(key, value, value.getClass());
                    }
                }
                json.writeObjectEnd();
            }

            @Override
            public HashMap read(Json json, JsonValue jsonData, Class type) {
                throw new UnsupportedOperationException("Native combat wire serializer is write-only");
            }
        });
        return json;
    }
}
