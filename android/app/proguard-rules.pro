# DeeYoung Pro Android — R8 rules (minify is OFF in v1; rules ready if enabled)
# Keep serialization metadata for kotlinx.serialization DTOs
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.deeyoungs.pro.**$$serializer { *; }
-keepclassmembers class com.deeyoungs.pro.** { *** Companion; }
-keepclasseswithmembers class com.deeyoungs.pro.** { kotlinx.serialization.KSerializer serializer(...); }

# Retrofit interface methods use reflection on generic signatures
-keepattributes Signature, Exceptions
-keepclassmembers,allowshrinking,allowobfuscation interface * { @retrofit2.http.* <methods>; }
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn javax.annotation.**
-dontwarn kotlin.Unit
-dontwarn retrofit2.KotlinExtensions
-dontwarn retrofit2.KotlinExtensions$*
