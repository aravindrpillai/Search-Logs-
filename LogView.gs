package integration.tools

uses com.google.common.collect.ImmutableList
uses gw.api.system.PLLoggerCategory
uses gw.api.util.DisplayableException
uses gw.api.util.LocationUtil
uses java.io.IOException
uses java.nio.file.FileVisitResult
uses java.nio.file.Files
uses java.nio.file.Path
uses java.nio.file.Paths
uses java.nio.file.SimpleFileVisitor
uses java.nio.file.attribute.BasicFileAttributes

/**
 * authoor : Aravind R Pillai
 * date: 25 August 2021
 */
class LogView {

  var filter1 : String as Filter1
  var filter2 : String as Filter2
  var filter3 : String as Filter3
  var selectedLogFile : String[]as SelectedLogFile
  var searchFromAll : Boolean as SearchFromAllLogs
  var date : Date as SearchtDate
  var checkLatestLogOnly : Boolean as CheckLatestLogsOnly = true
  var andOrOR : Boolean as AndOrOR = false
  var downloadLogs : Boolean as DownloadLogs = false
  var urlToPullLogs : String as URLToPullLogs
  var useGwLogs : Boolean as UseGWlogs = true
  var localLogsDir : String as LocalLogsDir = "C:/tmp/mylogs/"
  var copyOPLogsDir : String as CopyOPLogsDir = "C:/tmp/selected/"


  property get LogFiles() : String[] {
    var files = new HashSet<String>()
    foreach (file in getLogDirectories(LocalLogsDir)) {
      files.add(file.split("\\\\").last().split("\\.log").first())
    }
    return files.toTypedArray()
  }


  function filter() : List<String> {
    var filteredLogs : List<String>
    var content : String
    var criteria = prepareCriteria()

    if (SearchFromAllLogs) {
      filteredLogs = getLogDirectories(LocalLogsDir)
      if (CheckLatestLogsOnly) {
        filteredLogs = filteredLogs.where(\elt -> not elt.contains(".log."))
      }
    } else {
      filteredLogs = new ArrayList<String>()
      foreach (log in getLogDirectories(LocalLogsDir)) {
        if (CheckLatestLogsOnly) {
          if (log.contains(".log.")) {
            continue
          }
        }
        foreach (logkw in SelectedLogFile) {
          if (log.containsIgnoreCase(logkw)) {
            filteredLogs.add(log)
          }
        }
      }
    }

    var finalResponseLogs = new ArrayList<String>()
    foreach (logPath in filteredLogs) {
      content = new String(java.nio.file.Files.readAllBytes(Paths.get(logPath)), java.nio.charset.StandardCharsets.UTF_8)
      if (content == null or content == "") {
        continue
      }
      if (AndOrOR) {
        var considerThisFile = true
        foreach (c in criteria) {
          if (not content.containsIgnoreCase(c)) {
            considerThisFile = false
            break
          }
        }
        if (considerThisFile) {
          finalResponseLogs.add(getLoadablePath(Paths.get(logPath)))
        }
      } else {
        if (criteria.hasMatch(\elt1 -> content.containsIgnoreCase(elt1))) {
          finalResponseLogs.add(getLoadablePath(Paths.get(logPath)))
        }
      }
    }
    return finalResponseLogs
  }


  function prepareCriteria() : List<String> {
    var criteria = new ArrayList<String>()
    var atleastOneCriteria = false
    if (Filter1 != null and Filter1 != "") {
      atleastOneCriteria = true
      criteria.add(Filter1.trim())
    }
    if (Filter2 != null and Filter2 != "") {
      atleastOneCriteria = true
      criteria.add(Filter2.trim())
    }
    if (Filter3 != null and Filter3 != "") {
      atleastOneCriteria = true
      criteria.add(Filter3.trim())
    }
    if (date != null) {
      atleastOneCriteria = true
      criteria.add(date.YYYYMMDDWithZero)
    }
    if (not atleastOneCriteria) {
      throw new DisplayableException("Atleast one filter must be added")
    }
    return criteria
  }


  function getLoadablePath(path : Path) : String {
    return path.toRealPath().toString()
  }


  function downloadLogsFromEnv() {
    if (LocalLogsDir == null or LocalLogsDir == "") {
      throw new DisplayableException("Local directory not specified")
    }
    if (URLToPullLogs == null or URLToPullLogs == "") {
      throw new DisplayableException("URL to pull logs is not specified")
    }
    pullLogsForOneEnv(SelectedLogFile?.toList(), URLToPullLogs, LocalLogsDir, null)
  }

  function pullLogsForOneEnv(logKeyword : List<String>, logLoc : String, opLocation : String, node : String = null) {
    var allLogs = getAllAvailableLogs(logLoc)
    var filteredLogs : List<String>
    if (logKeyword.HasElements and (not SearchFromAllLogs)) {
      filteredLogs = new ArrayList<String>()
      foreach (log in allLogs) {
        foreach (logkw in logKeyword) {
          if (log.containsIgnoreCase(logkw)) {
            filteredLogs.add(log)
          }
        }
      }
    } else {
      filteredLogs = allLogs
    }
    if (not filteredLogs.HasElements) {
      print("No Files available")
      return
    }
    foreach (selectedLog in filteredLogs) {
      try {
        var logFullPath = logLoc.concat(selectedLog)
        print("Starting : " + logFullPath)
        var connection = new java.net.URL(logFullPath).openConnection()
        var content = connection.getInputStream().TextContent
        createFile(opLocation, selectedLog, content, node)
      } catch (e : Exception) {
        print(e.StackTraceAsString)
      }
    }
    print("Done...")
  }

  function getAllAvailableLogs(url : String) : List<String> {
    var inpStream = new java.net.URL(url).openConnection().getInputStream()
    var logPageContent = inpStream.TextContent.remove("</a>").remove("</pre>").remove("<pre>")
    var entireLogsFromEnv = new ArrayList<String>()
    foreach (line in logPageContent.split("\n")) {
      entireLogsFromEnv.add(line.split(">").last())
    }
    print("Found : " + entireLogsFromEnv.Count + " logs")
    return entireLogsFromEnv
  }

  function createFile(finalOutLoc : String, fileName : String, fileContent : String, nodeNumber : String = null) {
    try {
      fileName = fileName.remove(":")
      if (nodeNumber != "" and nodeNumber != null) {
        fileName = nodeNumber.concat("_").concat(fileName)
      }
      print("file save loc: " + finalOutLoc.concat(fileName))
      new java.io.File(finalOutLoc.concat(fileName)).createNewFile()
      var writer = new java.io.PrintWriter(finalOutLoc.concat(fileName), "UTF-8")
      writer.println(fileContent)
      writer.close()
    } catch (e) {
      print("Failed to save response to file : " + e.Message)
    }
  }

  public function getLogDirectories(overRidePath : String = null) : List<String> {
    var logDirs : Collection<Path>
    if (UseGWlogs or DownloadLogs) {
      logDirs = com.guidewire.logging.LoggingSystemProvider.get().getLogDirectories()
    } else {
      if (overRidePath == null or overRidePath == "") {
        throw new Exception("Custom logs path not specified.")
      } else {
        logDirs = {Paths.get(overRidePath)}
      }
    }

    final var files : Set<String> = new TreeSet<String>()
    for (dir in logDirs) {
      if (!Files.exists(dir, new java.nio.file.LinkOption[0])) {
        continue
      }
      final var matcher = dir.getFileSystem().getPathMatcher("glob:**.log*")
      try {
        Files.walkFileTree(dir, new SimpleFileVisitor<Path>() {
          public function visitFile(file : Path, attrs : BasicFileAttributes) : FileVisitResult {
            if (matcher.matches(file)) {
              files.add(file.toString())
            }
            return FileVisitResult.CONTINUE
          }
        }
        )
      } catch (e : IOException) {
        PLLoggerCategory.SERVER.warn("Cannot get list of log files", e)
      }
    }
    return ImmutableList.copyOf(files) as List<String>
  }


  function copyFilesToADiffLocation(paths : List<String>){
    foreach(path in paths){
      var fileName = path.split("\\\\").last()
      Files.copy(Paths.get(path), Paths.get(CopyOPLogsDir+"/"+fileName))
    }
    LocationUtil.addRequestScopedInfoMessage("Files copied")
  }

}