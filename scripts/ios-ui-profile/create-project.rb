require 'xcodeproj'
require 'fileutils'

# 설치된 앱을 외부 bundle ID로 제어한다. 앱 target·Pods·운영 설정은 수정하지 않는다.
destination, team = ARGV
abort 'usage: create-project.rb NEW_PRIVATE_DIRECTORY TEAM_ID' unless destination && team
abort 'invalid team' unless team.match?(/\A[A-Z0-9]{10}\z/)
repository = File.expand_path('../..', __dir__)
destination = File.expand_path(destination)
abort 'output must be outside repository' if destination == repository || destination.start_with?(repository + '/')
abort 'output already exists' if File.exist?(destination)
FileUtils.mkdir_p(destination, mode: 0700)
project = Xcodeproj::Project.new(File.join(destination, 'MotoMapProfile.xcodeproj'))
target = project.new_target(:ui_test_bundle, 'MotoMapProfile', :ios, '18.0')
source = project.main_group.new_file(File.expand_path('MotoMapProfile.swift', __dir__))
target.source_build_phase.add_file_reference(source)
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.ridemap.app.perf-uitests',
    'DEVELOPMENT_TEAM' => team,
    'CODE_SIGN_STYLE' => 'Automatic',
    'CODE_SIGN_IDENTITY' => 'Apple Development',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'SWIFT_VERSION' => '5.0',
    'TARGETED_DEVICE_FAMILY' => '1',
    'ENABLE_USER_SCRIPT_SANDBOXING' => 'YES',
  })
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.add_test_target(target)
scheme.test_action.build_configuration = 'Release'
scheme.save_as(project.path, 'MotoMapProfile', true)
