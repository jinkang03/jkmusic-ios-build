// 作用：在真实 CyMusicUserApiRuntime（macOS JavaScriptCore）里加载一个真实的 lx 音源脚本，
// 打印它上报的 init 结果与 sources 能力，用来判断"这个脚本在我们的运行时里能不能起来"。
// 不依赖 Xcode / Pods / iOS 构建，纯 clang + JSC。
//
// 编译并运行（由 scripts/check-source-load.sh 封装）：
//   check-source-load <preload.js> <source.js> [出参超时秒数]

#import <Foundation/Foundation.h>
#import "CyMusicUserApiRuntime.h"

static NSString *JSONString(id object) {
  if (!object || object == (id)kCFNull) return @"null";
  NSData *data = [NSJSONSerialization isValidJSONObject:object]
    ? [NSJSONSerialization dataWithJSONObject:object options:0 error:nil]
    : nil;
  if (!data) return [NSString stringWithFormat:@"%@", object];
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 3) {
      fprintf(stderr, "usage: check-source-load <preload.js> <source.js> [timeout]\n");
      return 2;
    }
    NSString *preloadPath = @(argv[1]);
    NSString *sourcePath = @(argv[2]);
    double timeout = argc > 3 ? atof(argv[3]) : 15.0;

    NSString *preload = [NSString stringWithContentsOfFile:preloadPath encoding:NSUTF8StringEncoding error:nil];
    NSString *script = [NSString stringWithContentsOfFile:sourcePath encoding:NSUTF8StringEncoding error:nil];
    if (!preload.length) { fprintf(stderr, "preload not readable: %s\n", argv[1]); return 2; }
    if (!script.length) { fprintf(stderr, "script not readable: %s\n", argv[2]); return 2; }

    __block int inited = 0;
    __block int failed = 0;

    CyMusicUserApiRuntime *runtime = [[CyMusicUserApiRuntime alloc]
      initWithPreloadURL:[NSURL fileURLWithPath:preloadPath]
            eventHandler:^(NSDictionary<NSString *, id> *event) {
      NSString *action = event[@"action"] ?: @"?";
      NSString *data = event[@"data"];
      NSString *log = event[@"log"];
      if ([action isEqualToString:@"init"]) {
        printf("EVENT init %s\n", [data ?: @"" UTF8String]);
        NSDictionary *info = data.length
          ? [NSJSONSerialization JSONObjectWithData:[data dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil]
          : nil;
        if ([info[@"status"] boolValue]) inited = 1;
        else { failed = 1; printf("INIT_ERROR %s\n", [info[@"errorMessage"] ?: @"unknown" UTF8String]); }
      } else if ([action isEqualToString:@"log"]) {
        printf("EVENT log %s %s\n", [event[@"type"] ?: @"" UTF8String], [log ?: @"" UTF8String]);
      } else {
        printf("EVENT %s %s\n", action.UTF8String, [data ?: @"" UTF8String]);
      }
      fflush(stdout);
    }];
    [runtime startObserving];

    NSString *generation = [runtime loadScript:@{
      @"id": @"probe",
      @"name": @"probe",
      @"description": @"",
      @"version": @"1",
      @"author": @"",
      @"homepage": @"",
      @"script": script,
    }];
    printf("GENERATION %s\n", generation.UTF8String);

    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:timeout];
    while (deadline.timeIntervalSinceNow > 0 && !inited && !failed) {
      [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
    }
    // 可选：INITED 之后立刻发一次 musicUrl 请求，用来验证脚本能不能真的取到播放地址
    if (inited && argc >= 5) {
      NSString *source = @(argv[4]);
      NSString *songmid = argc >= 6 ? @(argv[5]) : @"";
      NSString *name = argc >= 7 ? @(argv[6]) : @"";
      NSString *singer = argc >= 8 ? @(argv[7]) : @"";
      NSString *quality = argc >= 9 ? @(argv[8]) : @"320k";
      NSDictionary *payload = @{
        @"requestKey": @"probe-1",
        @"data": @{
          @"action": @"musicUrl",
          @"source": source,
          @"info": @{
            @"type": quality,
            @"musicInfo": @{
              @"id": songmid,
              @"songmid": songmid,
              @"hash": songmid,
              @"title": name,
              @"name": name,
              @"singer": singer,
              @"artist": singer,
              @"source": source,
            },
          },
        },
      };
      NSString *json = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:payload options:0 error:nil]
                                             encoding:NSUTF8StringEncoding];
      [runtime sendAction:@"request" info:json generation:generation];
      printf("SENT request source=%s songmid=%s quality=%s\n", source.UTF8String, songmid.UTF8String, quality.UTF8String);
      NSDate *deadline2 = [NSDate dateWithTimeIntervalSinceNow:timeout];
      while (deadline2.timeIntervalSinceNow > 0) {
        [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
      }
    }
    [runtime invalidate];
    printf("RESULT %s\n", inited ? "INITED" : (failed ? "FAILED" : "TIMEOUT"));
    return inited ? 0 : 1;
  }
}
