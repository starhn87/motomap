# 카카오 Android SDK 2.23(로그인)은 enum 상수를 원래 필드 이름으로 찾는다.
# ClientError의 기본 메시지 생성자는 Class.getField(ClientErrorCause.name())를 호출하고,
# GenericEnumSerializer는 @SerialName을 읽으려고 Class.getDeclaredField를 호출한다.
# R8이 그 필드를 지우거나 이름을 바꾸면 릴리스에서 처리되지 않은 예외로 앱이 죽는다.
#   NoSuchFieldException: TokenNotFound
#   NoSuchFieldException: No field InvalidRequest (TalkAuthCodeActivity)
# 공식 규칙: https://developers.kakao.com/docs/latest/ko/android/getting-started
# (선택: ProGuard 규칙). 2.23은 Gson이 아니라 kotlinx.serialization이라 enum 멤버와
# 런타임 어노테이션도 함께 유지한다. 이 래퍼(2.4.10)는 consumer R8 규칙을 넣지 않는다.

-keep class com.kakao.sdk.**.model.* { <fields>; }
-keep class com.kakao.sdk.**.model.** { <fields>; }
-keepclassmembers enum com.kakao.sdk.** {
    public static **[] values();
    public static ** valueOf(java.lang.String);
    <fields>;
}
-keepclassmembers class com.kakao.sdk.**.model.** {
    <fields>;
}
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod

-keep class * extends com.google.gson.TypeAdapter

# https://github.com/square/okhttp/pull/6792
-dontwarn org.bouncycastle.jsse.**
-dontwarn org.conscrypt.*
-dontwarn org.openjsse.**

# Retrofit (R8 full mode) — 카카오 시작하기 문서
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-if interface * { @retrofit2.http.* public *** *(...); }
-keep,allowoptimization,allowshrinking,allowobfuscation class <3>
-keep,allowobfuscation,allowshrinking class retrofit2.Response

# AGP 8 R8 full mode는 서비스 인터페이스를 지운다 (카카오 DevTalk).
-keep interface com.kakao.sdk.**.*Api
