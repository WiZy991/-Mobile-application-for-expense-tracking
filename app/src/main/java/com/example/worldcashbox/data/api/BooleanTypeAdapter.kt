package com.example.worldcashbox.data.api

import com.google.gson.TypeAdapter
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import com.google.gson.stream.JsonWriter

/**
 * Кастомный TypeAdapter для Boolean, который обрабатывает как boolean, так и число (0/1)
 * Это необходимо, так как некоторые поля в базе данных могут возвращать число вместо boolean
 */
class BooleanTypeAdapter : TypeAdapter<Boolean?>() {
    override fun write(out: JsonWriter, value: Boolean?) {
        if (value == null) {
            out.nullValue()
        } else {
            out.value(value)
        }
    }

    override fun read(`in`: JsonReader): Boolean? {
        val peek = `in`.peek()
        
        return when (peek) {
            JsonToken.NULL -> {
                `in`.nextNull()
                null
            }
            JsonToken.BOOLEAN -> {
                `in`.nextBoolean()
            }
            JsonToken.NUMBER -> {
                // Преобразуем число в boolean: 0 = false, любое другое число = true
                val number = `in`.nextInt()
                number != 0
            }
            JsonToken.STRING -> {
                // Обрабатываем строковые значения "true"/"false", "1"/"0"
                val stringValue = `in`.nextString()
                when {
                    stringValue.equals("true", ignoreCase = true) -> true
                    stringValue.equals("false", ignoreCase = true) -> false
                    stringValue == "1" -> true
                    stringValue == "0" -> false
                    else -> null
                }
            }
            else -> {
                `in`.skipValue()
                null
            }
        }
    }
}
